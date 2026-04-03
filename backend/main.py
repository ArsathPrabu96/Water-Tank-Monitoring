from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import sqlite3
from contextlib import asynccontextmanager

DATABASE_PATH = "watertank.db"


def init_database():
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            water_level REAL NOT NULL,
            distance_cm INTEGER NOT NULL,
            status TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices (id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices (id)
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM devices WHERE id = 'tank_001'")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO devices (id, name, location) VALUES (?, ?, ?)",
            ("tank_001", "Main Water Tank", "Home"),
        )

    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    yield


app = FastAPI(
    title="Water Tank Monitor API",
    description="IoT Water Level Monitoring System API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WaterData(BaseModel):
    device_id: str
    water_level: float
    distance_cm: int
    status: str
    timestamp: Optional[int] = None


class Device(BaseModel):
    id: str
    name: str
    location: Optional[str] = None


class Alert(BaseModel):
    id: Optional[int] = None
    device_id: str
    alert_type: str
    message: str
    created_at: Optional[datetime] = None


class ReadingResponse(BaseModel):
    id: int
    device_id: str
    water_level: float
    distance_cm: int
    status: str
    timestamp: datetime


def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


active_connections: List[WebSocket] = []


async def broadcast_to_clients(data: dict):
    for connection in active_connections:
        try:
            await connection.send_json(data)
        except:
            pass


@app.post("/api/v1/data", status_code=201)
async def receive_water_data(data: WaterData):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO readings (device_id, water_level, distance_cm, status)
           VALUES (?, ?, ?, ?)""",
        (data.device_id, data.water_level, data.distance_cm, data.status),
    )

    if data.status in ["LOW", "FULL"]:
        cursor.execute(
            """INSERT INTO alerts (device_id, alert_type, message)
               VALUES (?, ?, ?)""",
            (
                data.device_id,
                data.status,
                f"Water level is {data.status}: {data.water_level}%",
            ),
        )

    conn.commit()
    conn.close()

    await broadcast_to_clients(
        {
            "device_id": data.device_id,
            "water_level": data.water_level,
            "distance_cm": data.distance_cm,
            "status": data.status,
            "timestamp": datetime.now().isoformat(),
        }
    )

    return {"success": True, "message": "Data received"}


@app.get("/api/v1/data/latest", response_model=ReadingResponse)
async def get_latest_data(device_id: str = "tank_001"):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT * FROM readings 
           WHERE device_id = ? 
           ORDER BY timestamp DESC LIMIT 1""",
        (device_id,),
    )
    row = cursor.fetchone()
    conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="No data found")

    return dict(row)


@app.get("/api/v1/data/history", response_model=List[ReadingResponse])
async def get_history(device_id: str = "tank_001", limit: int = 100):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT * FROM readings 
           WHERE device_id = ? 
           ORDER BY timestamp DESC LIMIT ?""",
        (device_id, limit),
    )
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


@app.get("/api/v1/alerts", response_model=List[Alert])
async def get_alerts(device_id: str = "tank_001", limit: int = 50):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT * FROM alerts 
           WHERE device_id = ? 
           ORDER BY created_at DESC LIMIT ?""",
        (device_id, limit),
    )
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


@app.get("/api/v1/devices", response_model=List[Device])
async def get_devices():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM devices WHERE is_active = 1")
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


@app.get("/api/v1/devices/{device_id}", response_model=Device)
async def get_device(device_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM devices WHERE id = ?", (device_id,))
    row = cursor.fetchone()
    conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Device not found")

    return dict(row)


@app.post("/api/v1/devices", status_code=201)
async def register_device(device: Device):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO devices (id, name, location) VALUES (?, ?, ?)",
            (device.id, device.name, device.location),
        )
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Device already exists")
    finally:
        conn.close()

    return {"success": True, "message": "Device registered"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.remove(websocket)


@app.get("/api/v1/stats")
async def get_stats(device_id: str = "tank_001"):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT 
           COUNT(*) as total_readings,
           AVG(water_level) as avg_level,
           MIN(water_level) as min_level,
           MAX(water_level) as max_level
        FROM readings WHERE device_id = ?""",
        (device_id,),
    )
    stats = cursor.fetchone()

    cursor.execute(
        """SELECT COUNT(*) as alert_count FROM alerts 
           WHERE device_id = ? AND created_at > datetime('now', '-24 hours')""",
        (device_id,),
    )
    alerts = cursor.fetchone()

    conn.close()

    return {
        "total_readings": stats["total_readings"],
        "avg_level": round(stats["avg_level"], 2) if stats["avg_level"] else 0,
        "min_level": stats["min_level"],
        "max_level": stats["max_level"],
        "alerts_24h": alerts["alert_count"],
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.get("/")
async def root():
    return {"name": "Water Tank Monitor API", "version": "1.0.0", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
