# Mail Inboxes

Use one mailbox per live meaningful lane:

- `mail/inbox/<routing-id>.md`

These files hold runtime mail items addressed to that lane.

Do not confuse these with:

- `updates/inbox/` for routed behavior updates and workflow changes

When the buyer says `done` or `read your inbox`, a coordination lane should
usually check runtime mail first, then update inbox entries, then the compact
current truth artifacts implicated by unread mail.
