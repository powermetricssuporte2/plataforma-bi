FROM python:3.12-slim
WORKDIR /app
COPY ingestor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ingestor/ .
COPY config/ ../config/
# O conteudo de ingestor/ fica na raiz de /app: dentro do container o
# entrypoint e "main.py", nao "ingestor/main.py".
CMD ["python", "main.py"]
