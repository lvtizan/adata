#!/usr/bin/env python3
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)

@app.get("/")
async def root():
    return JSONResponse({"hello": "world", "status": "ok"})

@app.get("/test")
async def test():
    return {"test": "data", "value": 123}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8082)
