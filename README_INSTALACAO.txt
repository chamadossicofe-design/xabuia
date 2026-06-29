Xabuia Web - V22 admin consulta manual + SLA

Arquivos principais:
- index.html
- app.js
- styles.css
- firestore.rules

Como publicar:
1) Suba index.html, app.js e styles.css no seu GitHub Pages, substituindo os atuais.
2) Publique firestore.rules no Firebase Console > Firestore Database > Regras.
3) Faça Ctrl + F5 no navegador para garantir que o app.js novo carregou.

O que mudou:
- Admin não fica mais escutando chamados automaticamente o dia inteiro.
- Admin tem botão "Consultar ativos" para carregar aberto, reaberto e em tratamento, incluindo chamados reservados por outros operadores.
- Operador continua ao vivo: aberto/reaberto + somente os próprios em tratamento.
- Adicionado relatório de SLA/tempo parado por status.
- Os limites de minutos do SLA ficam no localStorage do navegador do admin.
- Adicionada coleção operador_eventos para relatório futuro mais justo por operador.

Observação:
- O arquivo xabuia.png não está dentro deste ZIP porque não foi enviado aqui. Mantenha o xabuia.png que já existe no seu GitHub Pages.


V22.1:
- Ajuste nas regras para Admin/Operador adicionar ocorrência em chamados já reservados/finalizados por outro usuário sem quebrar auditoria.
- Ajuste no app para não mostrar 'Erro ao salvar ocorrência' quando o chamado principal salvou, mas histórico/relatório secundário falhou por regra antiga.
