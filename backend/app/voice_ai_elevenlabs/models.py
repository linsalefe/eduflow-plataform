"""
Models SQLAlchemy para Call Campaigns.
"""
from sqlalchemy import (
    Column, String, Text, DateTime, Integer, BigInteger,
    ForeignKey, JSON, func, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


class CallCampaign(Base):
    __tablename__ = "call_campaigns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(255), nullable=False)
    dynamic_variables = Column(JSON, default={})
    status = Column(String(30), nullable=False, default="pending")
    total_items = Column(Integer, default=0)
    completed_items = Column(Integer, default=0)
    failed_items = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    items = relationship("CallCampaignItem", back_populates="campaign", order_by="CallCampaignItem.id")


class CallCampaignItem(Base):
    __tablename__ = "call_campaign_items"
    __table_args__ = (
        UniqueConstraint("campaign_id", "contact_id", name="uq_campaign_contact"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(Integer, ForeignKey("call_campaigns.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(BigInteger, ForeignKey("contacts.id"), nullable=False)
    phone_number = Column(String(30), nullable=False)
    resolved_variables = Column(JSON, default={})
    status = Column(String(30), nullable=False, default="pending")
    attempt_count = Column(Integer, default=0)
    call_id = Column(Integer, ForeignKey("ai_calls.id"), nullable=True)
    outcome = Column(String(30), nullable=True)
    duration_seconds = Column(Integer, default=0)
    summary = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    campaign = relationship("CallCampaign", back_populates="items")
    contact = relationship("Contact")