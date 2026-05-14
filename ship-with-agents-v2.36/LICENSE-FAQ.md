# License FAQ

Plain-English answers to the questions buyers actually ask. The
authoritative document is `LICENSE` — this file just makes the
answers easy to find.

---

## Can my company use it?

**Yes.** If your company bought one copy, your colleagues at that
company can use it on the company's projects. This is "internal team
use without per-seat counting" — a deliberate launch-era choice.
Future versions may introduce seat tiers; if so, your existing
license is grandfathered for the version you bought.

## Can I use it on client projects?

**Yes, unlimited.** Use the Pack on as many client projects as you
want — agency work, contracting, freelance gigs. Each client project
is one of your "end products."

## Can I share my modified version with teammates?

**Yes — within the buying organization.** You can adapt templates,
tweak prompts, customize the orchestration system to your team's
workflow, and share those modifications with your colleagues at the
same company.

What you can't do: send the modified files to someone *outside* your
organization, or publish them publicly as a derivative template pack
they can grab without buying.

## Can I open-source what I build with it?

**Yes.** What you build using the Pack — code, docs, products,
agents — is yours, and you can license your end product under any
terms you want, including MIT, Apache, GPL, or your own commercial
license.

The line: your end product can be open source. The Pack itself
(templates, prompts, orchestration files in their original or
near-original form) can't be redistributed as a separate downloadable
artifact, even inside an open-source project.

## Can I publish a public template / starter that's substantially this pack?

**No.** This is the one hard line. You can't take the Pack — even with
modifications — and publish it as your own template pack, starter
kit, prompt pack, agent system, or boilerplate, whether free or
paid, whether on Gumroad / npm / GitHub Releases / your own site.

Building a product that *uses* the Pack internally is fine. Building a
product that *is* the Pack (renamed, repackaged, lightly modified)
is not.

If you're unsure where the line falls for what you're planning, ask
before publishing.

## What if I leave the company that bought it?

**The license stays with the purchasing entity, not the individual.**
If your company bought the Pack and you leave, the Pack stays with
the company. To use it at your next role, the new organization needs
to buy its own copy.

If you bought it personally (not on behalf of an employer), the
license is yours and goes wherever you go.

## Are future versions included?

**No.** Each major version is a separate purchase. v2.0 buyers get
v2.0; v3.0 will be a separate release.

Patch updates within a version (v2.0 -> v2.0.1 -> v2.0.2) are included
free during the version's lifecycle.

Your version is identified at the top of `PACKAGE-MANIFEST.md`.

## Refunds?

Refunds are governed by the policy of the platform you bought from.
Reach out to the seller through that platform.

## Can I resell the Pack?

**No.** You can't resell, sublicense, or republish the Pack — even at
a different price, even bundled with other things, even after
modifications. The single-purchase license is for *use*, not for
*redistribution*.

## Can I include parts of the Pack in a course or tutorial I sell?

**Excerpts in educational context: usually fine.** If you're teaching
the patterns and want to quote a few lines from a prompt file, or
reference a template structure, that's normal educational use and
not a redistribution.

**Substantial inclusion: not without permission.** If your course
materials include large portions of the Pack as downloadable assets,
that's redistribution and isn't allowed. Reach out before doing this
— there may be a way to make it work.

## Can I use it with AI tools other than Claude?

**Yes.** The Pack is tool-agnostic at the pattern level. The
orchestration system shows Claude Code commands, but the underlying
patterns (head/super/manager/agent, checkpoints, two-chat method,
task packets) work in any environment with multiple chat sessions
and file persistence. See `TOOL-TRANSLATION-GUIDE.md`.

## I have a question not covered here.

Reach out through the platform you bought from. Most edge-case
questions have a sensible answer; the license is intended to be
buyer-friendly, not adversarial.
