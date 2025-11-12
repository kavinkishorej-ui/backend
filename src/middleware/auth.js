export const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Unauthorized - Please login' });
  }
  next();
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Unauthorized - Please login' });
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Forbidden - Insufficient permissions' });
    }

    next();
  };
};

export const requireAdmin = requireRole('admin');
export const requireTeacher = requireRole('teacher');
export const requireStudent = requireRole('student');
