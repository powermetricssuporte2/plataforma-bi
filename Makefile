PROJECT ?= $(shell gcloud config get-value project)

setup:            ## Cria infra GCP (APIs, SA, datasets, secret)
	bash infra/setup.sh

views:            ## Aplica/atualiza views SQL em todos os clientes ativos
	python3 infra/apply_views.py

ingest:           ## Roda ingestão local (todos os clientes ativos)
	cd ingestor && python3 main.py

ingest-piloto:    ## Roda ingestão só do piloto
	cd ingestor && python3 main.py --cliente integracao_modas

test:             ## Testes unitários do ingestor
	cd ingestor && python3 -m pytest tests/ -v

deploy:           ## Deploy completo (job + scheduler + functions + hosting)
	bash infra/deploy.sh

user:             ## Cria usuário: make user EMAIL=x SENHA=y CLIENTE=integracao_modas
	node scripts/create_user.js $(EMAIL) $(SENHA) $(CLIENTE)
