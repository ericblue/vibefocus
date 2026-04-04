from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Bucket
import schemas

router = APIRouter(prefix="/api/buckets", tags=["buckets"])


@router.get("", response_model=list[schemas.BucketOut])
def list_buckets(db: Session = Depends(get_db)):
    return db.query(Bucket).order_by(Bucket.position).all()


@router.post("", response_model=schemas.BucketOut, status_code=201)
def create_bucket(body: schemas.BucketCreate, db: Session = Depends(get_db)):
    bucket = Bucket(**body.model_dump())
    db.add(bucket)
    db.commit()
    db.refresh(bucket)
    return bucket


@router.patch("/{bucket_id}", response_model=schemas.BucketOut)
def update_bucket(bucket_id: str, body: schemas.BucketUpdate, db: Session = Depends(get_db)):
    b = db.get(Bucket, bucket_id)
    if not b:
        raise HTTPException(404, "Bucket not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(b, field, value)
    db.commit()
    db.refresh(b)
    return b


@router.delete("/{bucket_id}", status_code=204)
def delete_bucket(bucket_id: str, db: Session = Depends(get_db)):
    b = db.get(Bucket, bucket_id)
    if not b:
        raise HTTPException(404, "Bucket not found")
    db.delete(b)
    db.commit()
