import sys
from app.database import SessionLocal
from app.models.user import User
from app.schemas.complaint import ComplaintCreate
from app.routers.citizens import submit_complaint
import asyncio
from pydantic import ValidationError

async def main():
    db = SessionLocal()
    user = db.query(User).filter(User.email=="citizen@demo.com").first()
    comp_data = ComplaintCreate(
        description="Testing the submission with a very long description so it is valid.",
        location="Here",
        ward="Ward 1",
        is_public=True
    )
    try:
        res = await submit_complaint(comp_data, user, db)
        with open("error.txt", "w") as f:
            f.write("Success")
    except ValidationError as e:
        with open("error.txt", "w") as f:
            f.write(str(e))
    except Exception as e:
        import traceback
        with open("error.txt", "w") as f:
            f.write(traceback.format_exc())
    
    db.close()

asyncio.run(main())
