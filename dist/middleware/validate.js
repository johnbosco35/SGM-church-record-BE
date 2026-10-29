"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
/** Validates and replaces body/query/params with the parsed (stripped, coerced) values. */
function validate(schemas) {
    return (req, _res, next) => {
        try {
            if (schemas.params)
                req.params = schemas.params.parse(req.params);
            if (schemas.query)
                req.query = schemas.query.parse(req.query);
            if (schemas.body)
                req.body = schemas.body.parse(req.body ?? {});
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
//# sourceMappingURL=validate.js.map