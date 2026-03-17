-- Mark all stuck pending DMs as failed — recipients are pending testers
-- who haven't accepted their invitation, so these DMs will never succeed.
-- This is a one-time cleanup to stop the worker from retrying them.
UPDATE "dm_queue"
SET status = 'failed',
    error_message = 'MANUAL: Marked failed — recipients are pending testers who have not accepted invitation',
    updated_at = NOW()
WHERE status = 'pending';
