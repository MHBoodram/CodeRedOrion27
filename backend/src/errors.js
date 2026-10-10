class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Validates req[source] with a zod schema; parsed result lands on req.valid
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(new HttpError(400, 'Validation failed', result.error.flatten().fieldErrors));
  }
  req.valid = result.data;
  next();
};

function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.code === '23505') return res.status(409).json({ error: 'Already exists', detail: err.detail });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid identifier format' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { HttpError, validate, errorHandler };
