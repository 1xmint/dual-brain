# OPERATIONS.md

## Purpose

This document describes how to operate the repo in production or near-production environments.

## Deploy

- standard deploy workflow:
- source branch:
- environment:
- approval model:
- rollback path:

## Runtime Truth

- live server path:
- runtime user:
- admin user:
- service/process names:
- data path:

## Secrets

- where secrets live:
- how they are rotated:
- what must never be committed:

## Backup

- what data is backed up:
- backup command or workflow:
- backup path:
- retention:

## Restore Drill

Document the exact restore test process.

Suggested checklist:

1. create fresh snapshot
2. verify expected files exist
3. run integrity checks
4. verify the restore path is understood
5. record outcome and timing

## Monitoring / Health

- primary health endpoint:
- expected success signal:
- what alerts or failures matter:

## Incident Notes

- common failure modes:
- first steps during incident response:
- who/what is the source of truth during an incident:
