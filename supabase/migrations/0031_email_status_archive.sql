-- WO-29 W2 · soft-delete + archive for the inbox. email_message.status was
-- ('pending','filed','needs_review'); widen it to allow reversible 'archived' and 'deleted'
-- states so the inbox gets real delete/archive with undo (the record is kept, just hidden — the
-- page already filters to review/filed, so these are invisible without any query change).
-- Additive + idempotent: widening the allowed set never invalidates an existing row.
alter table email_message drop constraint if exists email_message_status_check;
alter table email_message add constraint email_message_status_check
  check (status in ('pending', 'filed', 'needs_review', 'archived', 'deleted'));
