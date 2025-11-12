import express from 'express';
import { supabase } from '../config/database.js';
import { requireStudent } from '../middleware/auth.js';
import { logActivity } from '../utils/helpers.js';

const router = express.Router();

router.use(requireStudent);

router.get('/profile', async (req, res) => {
  try {
    const studentId = req.session.user.id;

    const { data: student, error } = await supabase
      .from('students')
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .eq('id', studentId)
      .single();

    if (error) throw error;

    res.json({
      student: {
        id: student.id,
        studentId: student.student_id,
        fullName: student.full_name,
        email: student.email,
        semester: student.semester,
        year: student.year,
        batch: student.batch,
        department: student.departments
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.get('/marks', async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { exam, semester } = req.query;

    let query = supabase
      .from('marks')
      .select(`
        *,
        subjects:subject_id (
          id,
          code,
          name
        )
      `)
      .eq('student_id', studentId);

    if (exam) {
      query = query.eq('exam_name', exam);
    }

    const { data: marks, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const formattedMarks = marks.map(mark => ({
      id: mark.id,
      subject: mark.subjects,
      examName: mark.exam_name,
      marks: mark.marks,
      maxMarks: mark.max_marks,
      percentage: ((mark.marks / mark.max_marks) * 100).toFixed(2),
      createdAt: mark.created_at
    }));

    const groupedByExam = formattedMarks.reduce((acc, mark) => {
      if (!acc[mark.examName]) {
        acc[mark.examName] = [];
      }
      acc[mark.examName].push(mark);
      return acc;
    }, {});

    res.json({
      marks: formattedMarks,
      groupedByExam
    });
  } catch (error) {
    console.error('Get marks error:', error);
    res.status(500).json({ error: 'Failed to fetch marks' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const studentId = req.session.user.id;

    const { data: student } = await supabase
      .from('students')
      .select('department_id')
      .eq('id', studentId)
      .single();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const { data: subjects, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('department_id', student.department_id)
      .order('code');

    if (error) throw error;

    res.json({ subjects: subjects || [] });
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const studentId = req.session.user.id;

    const { data: marks } = await supabase
      .from('marks')
      .select('marks, max_marks, exam_name')
      .eq('student_id', studentId);

    if (!marks || marks.length === 0) {
      return res.json({
        summary: {
          totalExams: 0,
          totalMarks: 0,
          totalMaxMarks: 0,
          overallPercentage: 0,
          examWiseSummary: []
        }
      });
    }

    const totalMarks = marks.reduce((sum, m) => sum + parseFloat(m.marks), 0);
    const totalMaxMarks = marks.reduce((sum, m) => sum + parseFloat(m.max_marks), 0);
    const overallPercentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(2) : 0;

    const examWise = marks.reduce((acc, mark) => {
      if (!acc[mark.exam_name]) {
        acc[mark.exam_name] = { marks: 0, maxMarks: 0, count: 0 };
      }
      acc[mark.exam_name].marks += parseFloat(mark.marks);
      acc[mark.exam_name].maxMarks += parseFloat(mark.max_marks);
      acc[mark.exam_name].count += 1;
      return acc;
    }, {});

    const examWiseSummary = Object.entries(examWise).map(([exam, data]) => ({
      exam,
      totalMarks: data.marks,
      totalMaxMarks: data.maxMarks,
      percentage: ((data.marks / data.maxMarks) * 100).toFixed(2),
      subjectsCount: data.count
    }));

    res.json({
      summary: {
        totalExams: Object.keys(examWise).length,
        totalMarks,
        totalMaxMarks,
        overallPercentage,
        examWiseSummary
      }
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { fullName, email } = req.body;

    const updateData = {};

    if (fullName) updateData.full_name = fullName;

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updateData.email = email;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', studentId)
      .select(`
        *,
        departments:department_id (
          id,
          name
        )
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw error;
    }

    await logActivity(supabase, 'student', studentId, 'profile_updated', {
      updatedFields: Object.keys(updateData)
    });

    res.json({
      success: true,
      student: {
        id: data.id,
        studentId: data.student_id,
        fullName: data.full_name,
        email: data.email,
        semester: data.semester,
        year: data.year,
        batch: data.batch,
        department: data.departments
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
