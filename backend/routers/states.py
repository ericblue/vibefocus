from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import State, Project
import schemas

router = APIRouter(prefix="/api/states", tags=["states"])


@router.get("", response_model=list[schemas.StateOut])
def list_states(db: Session = Depends(get_db)):
    return db.query(State).order_by(State.position).all()


@router.post("", response_model=schemas.StateOut, status_code=201)
def create_state(body: schemas.StateCreate, db: Session = Depends(get_db)):
    state = State(**body.model_dump())
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


@router.patch("/{state_id}", response_model=schemas.StateOut)
def update_state(state_id: str, body: schemas.StateUpdate, db: Session = Depends(get_db)):
    s = db.get(State, state_id)
    if not s:
        raise HTTPException(404, "State not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{state_id}", status_code=204)
def delete_state(state_id: str, db: Session = Depends(get_db)):
    s = db.get(State, state_id)
    if not s:
        raise HTTPException(404, "State not found")
    count = db.query(Project).filter(Project.state_id == state_id).count()
    if count > 0:
        raise HTTPException(409, f"Cannot delete state with {count} project(s) assigned")
    db.delete(s)
    db.commit()
