Xabuia Web V28 - reservar + alerta no título

Arquivos principais:
- index.html
- styles.css
- app.js

O que mudou:
1. Lista de chamados mais organizada por prioridade de status:
   Reaberto, Aberto, Em tratamento, Informações divergentes, Devolver/recusar, Finalizado.
2. Botão Reservar aparece somente em chamados Abertos/Reabertos para admin/operador.
3. Clicar em Reservar coloca o chamado em Em tratamento e grava histórico como Tratativa.
4. O título do navegador passa a mostrar a quantidade carregada de chamados Abertos + Reabertos.
5. Quando essa quantidade aumenta, o título pisca por alguns segundos.

Não inclui firestore.rules.
Para testar local:
python -m http.server 8000
Depois abra:
http://localhost:8000
