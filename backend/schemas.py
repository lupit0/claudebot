from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# --- Collateral ---
class CollateralItemCreate(BaseModel):
    isin: str
    description: Optional[str] = None
    quantity: Optional[float] = None


class CollateralItemOut(CollateralItemCreate):
    id: int

    class Config:
        from_attributes = True


# --- Attachment ---
class AttachmentOut(BaseModel):
    id: int
    filename: str
    file_type: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


# --- Response ---
class ResponseCreate(BaseModel):
    responder: Optional[str] = None
    rate_spread: Optional[str] = None
    haircut: Optional[str] = None
    terms: Optional[str] = None
    notes: Optional[str] = None


class ResponseOut(ResponseCreate):
    id: int
    inquiry_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Audit Log ---
class AuditLogOut(BaseModel):
    id: int
    action: str
    details: Optional[str] = None
    actor: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Inquiry ---
class InquiryCreate(BaseModel):
    counterparty: str
    product_type: str
    cash_direction: str
    notional: Optional[float] = None
    currency: str = "USD"
    tenor: Optional[str] = None
    rate_spread: Optional[str] = None
    haircut: Optional[str] = None
    sales_person: Optional[str] = None
    notes: Optional[str] = None
    pasted_data: Optional[str] = None
    collateral_items: list[CollateralItemCreate] = []


class InquiryUpdate(BaseModel):
    counterparty: Optional[str] = None
    product_type: Optional[str] = None
    cash_direction: Optional[str] = None
    notional: Optional[float] = None
    currency: Optional[str] = None
    tenor: Optional[str] = None
    rate_spread: Optional[str] = None
    haircut: Optional[str] = None
    status: Optional[str] = None
    sales_person: Optional[str] = None
    notes: Optional[str] = None
    pasted_data: Optional[str] = None


class InquirySummary(BaseModel):
    id: int
    counterparty: str
    product_type: str
    cash_direction: str
    notional: Optional[float] = None
    currency: str
    tenor: Optional[str] = None
    rate_spread: Optional[str] = None
    haircut: Optional[str] = None
    status: str
    sales_person: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    response_count: int = 0
    attachment_count: int = 0

    class Config:
        from_attributes = True


class InquiryDetail(BaseModel):
    id: int
    counterparty: str
    product_type: str
    cash_direction: str
    notional: Optional[float] = None
    currency: str
    tenor: Optional[str] = None
    rate_spread: Optional[str] = None
    haircut: Optional[str] = None
    status: str
    sales_person: Optional[str] = None
    notes: Optional[str] = None
    pasted_data: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    collateral_items: list[CollateralItemOut] = []
    attachments: list[AttachmentOut] = []
    responses: list[ResponseOut] = []
    audit_logs: list[AuditLogOut] = []

    class Config:
        from_attributes = True
