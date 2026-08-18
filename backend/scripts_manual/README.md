# scripts_manual

Scripts SQL de operação rodados à mão em produção, guardados para auditoria:
o que foi feito, quando, em qual tenant e como desfazer.

Não são migrations. Migration de schema vive em `backend/migrations/` e vale
para todos os ambientes; o que está aqui é intervenção pontual em dados de um
tenant específico, que roda uma vez e não se repete.

## Convenção

- Nome: `<acao>_<tenant/alvo>_<AAAAMMDD>.sql`
- Todo script destrutivo tem um par `REVERTER_<mesmo_nome>.sql`
- Cabeçalho obrigatório: data, tenant, o que faz, o que preserva e como reverter
- `\set ON_ERROR_STOP on` e `BEGIN/COMMIT` — nada roda pela metade

## Dumps não entram no git

Os `backup_dump_*.sql` são ignorados pelo `.gitignore`: carregam dados reais de
contatos, mensagens e telefones. Ficam apenas no servidor.

Consequência prática: o `REVERTER_limpar_perdido_desqual_gvsports_20260716.sql`
menciona `backup_dump_20260716.sql` como último recurso, caso as tabelas
`bkp_clean_20260716_*` já tenham sido dropadas. Esse dump existe só em
`/home/ubuntu/eduflow/backend/scripts_manual/` na máquina de produção.

## Histórico

| Data | Alvo | Script |
|------|------|--------|
| 2026-07-16 | tenant 4 (GV Sports) | Remove cards das colunas Perdido/Desqualificado do quadro (`pipeline_id = NULL`), preservando contatos, mensagens, tags e `lead_status` |
