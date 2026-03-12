---
'@directus/api': patch
---

Fixed nullable placement in OpenAPI spec generation for relation fields. Per OpenAPI 3.0, the `nullable` keyword is only valid when `type` is declared on the same schema object. For m2o relation fields using `oneOf`, `nullable` is now placed on the primitive type leg inside `oneOf` instead of the parent schema object.
