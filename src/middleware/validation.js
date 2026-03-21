const { body, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
};

// ─── Auth Validations ─────────────────────────────────────────────

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter')
    .matches(/\d/).withMessage('Password must contain at least one number'),
  body('name').optional().isLength({ max: 100 }).withMessage('Name must be under 100 characters')
    .trim().escape(),
  body('phone').optional().isLength({ max: 20 }).withMessage('Phone must be under 20 characters')
    .matches(/^[+\d\s()-]*$/).withMessage('Invalid phone format'),
  validate
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  validate
];

// ─── Automation Validations ───────────────────────────────────────

const createAutomationValidation = [
  body('instagramAccountId').notEmpty().withMessage('Instagram account is required'),
  body('name').notEmpty().isLength({ max: 200 }).withMessage('Name is required (max 200 chars)')
    .trim(),
  body('keywords').optional().isArray({ max: 50 }).withMessage('Keywords must be an array (max 50)'),
  body('responseMessage').optional().isLength({ max: 2000 }).withMessage('Response message too long (max 2000 chars)'),
  body('finalMessage').optional().isLength({ max: 2000 }).withMessage('Final message too long (max 2000 chars)'),
  body('aiCtaUrl').optional().isLength({ max: 500 }).withMessage('CTA URL too long'),
  validate
];

// ─── Query Param Sanitizer ────────────────────────────────────────
// Middleware to sanitize common query params (limit, days, dates)

function sanitizeQueryParams(req, res, next) {
  // Sanitize limit
  if (req.query.limit !== undefined) {
    const limit = parseInt(req.query.limit);
    if (isNaN(limit) || limit < 1) {
      req.query.limit = 100;
    } else {
      req.query.limit = Math.min(limit, 500); // Cap at 500
    }
  }

  // Sanitize days
  if (req.query.days !== undefined) {
    const days = parseInt(req.query.days);
    if (isNaN(days) || days < 1) {
      req.query.days = 30;
    } else {
      req.query.days = Math.min(days, 365); // Cap at 1 year
    }
  }

  // Sanitize dates
  if (req.query.startDate) {
    const d = new Date(req.query.startDate);
    if (isNaN(d.getTime())) {
      delete req.query.startDate;
    }
  }
  if (req.query.endDate) {
    const d = new Date(req.query.endDate);
    if (isNaN(d.getTime())) {
      delete req.query.endDate;
    }
  }

  next();
}

module.exports = {
  registerValidation,
  loginValidation,
  resetPasswordValidation,
  createAutomationValidation,
  sanitizeQueryParams,
  validate
};
