FROM python:3.12-slim
WORKDIR /app
COPY ingestor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ingestor/ .
COPY config/ ../config/
CMD ["python", "main.py"]
