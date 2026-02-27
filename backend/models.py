import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, ForeignKey, Enum
)
from sqlalchemy.orm import relationship
import enum

from database import Base


class InquiryStatus(str, enum.Enum):
    NEW = "New"
    RESPONDED = "Responded"
    TRADED = "Traded"
    DECLINED = "Declined"


class CashDirection(str, enum.Enum):
    GIVE = "Give"
    RECEIVE = "Receive"


class ProductType(str, enum.Enum):
    REPO = "Repo"
    REVERSE_REPO = "Reverse Repo"
    SAS = "SAS"
    ABL = "ABL"


class Inquiry(Base):
    __tablename__ = "inquiries"

    id = Column(Integer, primary_key=True, index=True)
    counterparty = Column(String(255), nullable=False)
    product_type = Column(String(50), nullable=False)
    cash_direction = Column(String(10), nullable=False)
    notional = Column(Float, nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    tenor = Column(String(50), nullable=True)
    rate_spread = Column(String(100), nullable=True)
    haircut = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default=InquiryStatus.NEW.value)
    sales_person = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    pasted_data = Column(Text, nullable=True)  # For pasted tables/data
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    collateral_items = relationship("CollateralItem", back_populates="inquiry", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="inquiry", cascade="all, delete-orphan")
    responses = relationship("Response", back_populates="inquiry", cascade="all, delete-orphan", order_by="Response.created_at.desc()")
    audit_logs = relationship("AuditLog", back_populates="inquiry", cascade="all, delete-orphan", order_by="AuditLog.created_at.desc()")


class CollateralItem(Base):
    __tablename__ = "collateral_items"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(Integer, ForeignKey("inquiries.id"), nullable=False)
    isin = Column(String(20), nullable=False)
    description = Column(String(255), nullable=True)
    quantity = Column(Float, nullable=True)

    inquiry = relationship("Inquiry", back_populates="collateral_items")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(Integer, ForeignKey("inquiries.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)

    inquiry = relationship("Inquiry", back_populates="attachments")


class Response(Base):
    __tablename__ = "responses"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(Integer, ForeignKey("inquiries.id"), nullable=False)
    responder = Column(String(255), nullable=True)
    rate_spread = Column(String(100), nullable=True)
    haircut = Column(String(50), nullable=True)
    terms = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    inquiry = relationship("Inquiry", back_populates="responses")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(Integer, ForeignKey("inquiries.id"), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    actor = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    inquiry = relationship("Inquiry", back_populates="audit_logs")
