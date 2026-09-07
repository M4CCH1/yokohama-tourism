from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from database import engine

app = FastAPI()


@app.get("/test-db")
def test_db():
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT COUNT(*) FROM tourist_spots")
        )
        count = result.scalar()

    return {"tourist_spots_count": count}


@app.get("/spots")
def get_spots():
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                id,
                name,
                category,
                stay_minutes,
                image_url,
                ST_Y(geom) AS latitude,
                ST_X(geom) AS longitude
            FROM tourist_spots
            ORDER BY id
        """))

        spots = []

        for row in result:
            spots.append({
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "stay_minutes": row.stay_minutes,
                "image_url": row.image_url,
                "latitude": row.latitude,
                "longitude": row.longitude
            })

    return spots



@app.get("/start-points")
def get_start_points():
    with engine.connect() as conn:

        result = conn.execute(text("""
            SELECT
                id,
                name,
                point_type,
                ST_Y(geom) AS latitude,
                ST_X(geom) AS longitude
            FROM start_points
        """))

        return [
            {
                "id": row.id,
                "name": row.name,
                "point_type": row.point_type,
                "latitude": row.latitude,
                "longitude": row.longitude
            }
            for row in result
        ]

# 一番最後に書く
app.mount("/", StaticFiles(directory="static", html=True), name="static")