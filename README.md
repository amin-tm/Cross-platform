this is file transfer app. 
update 1.



## Scheduled cleanup

Configure your hosting scheduler to call GET /api/cron/transfers every few minutes
with the Authorization header set to Bearer followed by the value of CRON_SECRET.
Set CRON_SECRET only when that job is configured. Each run processes up to 25
expired transfers and reports failed deletions so the scheduler can retry them.
