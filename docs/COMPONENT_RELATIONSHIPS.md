# Component relationship persistence

Relationships are additive project data in TYT schema version 1. Each record has
stable `id`, `sourceComponentId`, `targetComponentId`, `type`, `label`, `direction`,
`state`, `description`, ISO timestamps and optional `sourceSceneId`.

Changing a component's category hides character relationships in the interface;
it does not delete the records. Missing endpoints remain stored and unresolved.
Character-specific JSON such as `characterPayload`, `extensions`, library origin
and component positions survives category changes, import and export. Optional
project `graphLayout` is also retained without requiring a graph interface.

Screenplay history includes relationships and component payload. Restoring notes
or outline history leaves current screenplay data and page selections unchanged.
Restoring an old screenplay snapshot without page versions resets incompatible
page ranges so the editor can measure that older text again.

## TYTL compatibility

Component libraries remain schema version 1, with additive `extensionsVersion: 1`,
`relationships` and optional `graphLayout`. Older libraries without these fields
remain valid. Updating from an older library preserves absent or empty hidden
extensions and existing relationship records. Nested incoming extension values
merge with retained values; category changes never clear them.

Subset exports include relationships touching any selected component, including
links whose other endpoint is outside the subset. Imported endpoints map through
exact library/component identities. Missing endpoints receive stable unresolved
identities and never bind by a coincidentally matching local name or ID. A later
import from the same library can resolve that exact endpoint. Relationship IDs
stay stable across repeated updates through optional `librarySource` provenance:
`libraryId`, `relationshipId`, `sourceComponentId`, `targetComponentId`.

Opaque extension JSON is bounded (24 nested levels, 20,000 values, 250,000
characters per string, 2 MiB serialized per component). Oversized or invalid
extension data raises an explicit error instead of silently disappearing.

Pure regression checks:

```text
node --test tests/component-relationship-persistence.test.mjs tests/page-version-history.test.mjs
```
