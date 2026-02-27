import os
import uuid
import datetime
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import engine, get_db, Base
from models import Inquiry, CollateralItem, Attachment, Response, AuditLog
from schemas import (
    InquiryCreate, InquiryUpdate, InquirySummary, InquiryDetail,
    ResponseCreate, ResponseOut, AttachmentOut, CollateralItemCreate,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Trade Inquiry Tracker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def add_audit_log(db: Session, inquiry_id: int, action: str, details: str = None, actor: str = None):
    log = AuditLog(inquiry_id=inquiry_id, action=action, details=details, actor=actor)
    db.add(log)


# ─── Reference Data ───────────────────────────────────────────────

@app.get("/api/reference/product-types")
def get_product_types():
    return ["Repo", "Reverse Repo", "SAS", "ABL"]


@app.get("/api/reference/currencies")
def get_currencies():
    return ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "HKD", "SGD", "CNY"]


# ─── Inquiries ────────────────────────────────────────────────────

@app.get("/api/inquiries", response_model=list[InquirySummary])
def list_inquiries(
    status: Optional[str] = None,
    product_type: Optional[str] = None,
    counterparty: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Inquiry)
    if status:
        q = q.filter(Inquiry.status == status)
    if product_type:
        q = q.filter(Inquiry.product_type == product_type)
    if counterparty:
        q = q.filter(Inquiry.counterparty.ilike(f"%{counterparty}%"))
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            (Inquiry.counterparty.ilike(pattern))
            | (Inquiry.sales_person.ilike(pattern))
            | (Inquiry.notes.ilike(pattern))
        )
    inquiries = q.order_by(Inquiry.created_at.desc()).offset(skip).limit(limit).all()

    results = []
    for inq in inquiries:
        results.append(InquirySummary(
            id=inq.id,
            counterparty=inq.counterparty,
            product_type=inq.product_type,
            cash_direction=inq.cash_direction,
            notional=inq.notional,
            currency=inq.currency,
            tenor=inq.tenor,
            rate_spread=inq.rate_spread,
            haircut=inq.haircut,
            status=inq.status,
            sales_person=inq.sales_person,
            created_at=inq.created_at,
            updated_at=inq.updated_at,
            response_count=len(inq.responses),
            attachment_count=len(inq.attachments),
        ))
    return results


@app.post("/api/inquiries", response_model=InquiryDetail)
def create_inquiry(data: InquiryCreate, db: Session = Depends(get_db)):
    inq = Inquiry(
        counterparty=data.counterparty,
        product_type=data.product_type,
        cash_direction=data.cash_direction,
        notional=data.notional,
        currency=data.currency,
        tenor=data.tenor,
        rate_spread=data.rate_spread,
        haircut=data.haircut,
        sales_person=data.sales_person,
        notes=data.notes,
        pasted_data=data.pasted_data,
    )
    db.add(inq)
    db.flush()

    for col in data.collateral_items:
        db.add(CollateralItem(
            inquiry_id=inq.id, isin=col.isin,
            description=col.description, quantity=col.quantity,
        ))

    add_audit_log(db, inq.id, "Created", f"Inquiry created by {data.sales_person or 'unknown'}", data.sales_person)
    db.commit()
    db.refresh(inq)
    return inq


@app.get("/api/inquiries/{inquiry_id}", response_model=InquiryDetail)
def get_inquiry(inquiry_id: int, db: Session = Depends(get_db)):
    inq = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    return inq


@app.patch("/api/inquiries/{inquiry_id}", response_model=InquiryDetail)
def update_inquiry(inquiry_id: int, data: InquiryUpdate, db: Session = Depends(get_db)):
    inq = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    changes = []
    for field, value in data.model_dump(exclude_unset=True).items():
        old_val = getattr(inq, field)
        if old_val != value:
            changes.append(f"{field}: {old_val} → {value}")
            setattr(inq, field, value)

    if changes:
        add_audit_log(db, inq.id, "Updated", "; ".join(changes))

    db.commit()
    db.refresh(inq)
    return inq


@app.delete("/api/inquiries/{inquiry_id}")
def delete_inquiry(inquiry_id: int, db: Session = Depends(get_db)):
    inq = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    db.delete(inq)
    db.commit()
    return {"ok": True}


# ─── Collateral ───────────────────────────────────────────────────

@app.post("/api/inquiries/{inquiry_id}/collateral")
def add_collateral(inquiry_id: int, data: CollateralItemCreate, db: Session = Depends(get_db)):
    inq = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    item = CollateralItem(inquiry_id=inquiry_id, isin=data.isin, description=data.description, quantity=data.quantity)
    db.add(item)
    add_audit_log(db, inquiry_id, "Collateral added", f"ISIN: {data.isin}")
    db.commit()
    db.refresh(item)
    return item


@app.delete("/api/inquiries/{inquiry_id}/collateral/{item_id}")
def remove_collateral(inquiry_id: int, item_id: int, db: Session = Depends(get_db)):
    item = db.query(CollateralItem).filter(CollateralItem.id == item_id, CollateralItem.inquiry_id == inquiry_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Collateral item not found")
    db.delete(item)
    add_audit_log(db, inquiry_id, "Collateral removed", f"ISIN: {item.isin}")
    db.commit()
    return {"ok": True}


# ─── Responses ────────────────────────────────────────────────────

@app.post("/api/inquiries/{inquiry_id}/responses", response_model=ResponseOut)
def add_response(inquiry_id: int, data: ResponseCreate, db: Session = Depends(get_db)):
    inq = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    resp = Response(
        inquiry_id=inquiry_id,
        responder=data.responder,
        rate_spread=data.rate_spread,
        haircut=data.haircut,
        terms=data.terms,
        notes=data.notes,
    )
    db.add(resp)

    if inq.status == "New":
        inq.status = "Responded"
        add_audit_log(db, inquiry_id, "Status changed", "New → Responded", data.responder)

    add_audit_log(db, inquiry_id, "Response added", f"By {data.responder or 'unknown'}", data.responder)
    db.commit()
    db.refresh(resp)
    return resp


# ─── File Uploads ─────────────────────────────────────────────────

@app.post("/api/inquiries/{inquiry_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(inquiry_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    inq = db.query(Inquiry).filter(Inquiry.id == inquiry_id).first()
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")

    ext = os.path.splitext(file.filename)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    att = Attachment(
        inquiry_id=inquiry_id,
        filename=file.filename,
        filepath=stored_name,
        file_type=file.content_type,
    )
    db.add(att)
    add_audit_log(db, inquiry_id, "File uploaded", f"{file.filename}")
    db.commit()
    db.refresh(att)
    return att


@app.get("/api/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    att = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    from fastapi.responses import FileResponse
    return FileResponse(
        os.path.join(UPLOAD_DIR, att.filepath),
        filename=att.filename,
        media_type=att.file_type or "application/octet-stream",
    )


@app.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    att = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    try:
        os.remove(os.path.join(UPLOAD_DIR, att.filepath))
    except OSError:
        pass
    add_audit_log(db, att.inquiry_id, "File deleted", att.filename)
    db.delete(att)
    db.commit()
    return {"ok": True}


# ─── Dashboard Stats ──────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(Inquiry.id)).scalar()
    new = db.query(func.count(Inquiry.id)).filter(Inquiry.status == "New").scalar()
    responded = db.query(func.count(Inquiry.id)).filter(Inquiry.status == "Responded").scalar()
    traded = db.query(func.count(Inquiry.id)).filter(Inquiry.status == "Traded").scalar()
    declined = db.query(func.count(Inquiry.id)).filter(Inquiry.status == "Declined").scalar()
    return {
        "total": total,
        "new": new,
        "responded": responded,
        "traded": traded,
        "declined": declined,
    }
