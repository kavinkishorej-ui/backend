import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  try {
    console.log('Starting database seeding...');

    console.log('Creating departments...');
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .upsert([
        { name: 'Computer Science and Engineering' },
        { name: 'Electronics and Communication Engineering' }
      ], { onConflict: 'name' })
      .select();

    if (deptError) {
      console.error('Department creation error:', deptError);
      throw deptError;
    }

    const cseDept = departments.find(d => d.name.includes('Computer'));
    const eceDept = departments.find(d => d.name.includes('Electronics'));

    console.log('Creating admin account...');
    const adminPasswordHash = await bcrypt.hash('Admin@123', 10);

    const { data: existingAdmin } = await supabase
      .from('admins')
      .select('id')
      .eq('username', 'admin')
      .maybeSingle();

    if (!existingAdmin) {
      await supabase
        .from('admins')
        .insert({
          username: 'admin',
          password_hash: adminPasswordHash,
          full_name: 'System Administrator',
          email: 'admin@studentportal.com'
        });
      console.log('Admin created: username=admin, password=Admin@123');
    } else {
      console.log('Admin already exists');
    }

    console.log('Creating teacher accounts...');
    const teacher1PasswordHash = await bcrypt.hash('Teacher@123', 10);
    const teacher2PasswordHash = await bcrypt.hash('Teacher@123', 10);

    const { data: existingTeacher1 } = await supabase
      .from('teachers')
      .select('id')
      .eq('teacher_id', 'T10001')
      .maybeSingle();

    const { data: existingTeacher2 } = await supabase
      .from('teachers')
      .select('id')
      .eq('teacher_id', 'T10002')
      .maybeSingle();

    let teacher1, teacher2;

    if (!existingTeacher1) {
      const { data } = await supabase
        .from('teachers')
        .insert({
          teacher_id: 'T10001',
          username: 'T10001',
          password_hash: teacher1PasswordHash,
          full_name: 'Dr. Rajesh Kumar',
          email: 'rajesh.kumar@studentportal.com',
          phone: '9876543210',
          department_id: cseDept.id,
          must_change_password: false
        })
        .select()
        .single();
      teacher1 = data;
      console.log('Teacher created: teacher_id=T10001, password=Teacher@123, dept=CSE');
    } else {
      teacher1 = existingTeacher1;
      console.log('Teacher T10001 already exists');
    }

    if (!existingTeacher2) {
      const { data } = await supabase
        .from('teachers')
        .insert({
          teacher_id: 'T10002',
          username: 'T10002',
          password_hash: teacher2PasswordHash,
          full_name: 'Dr. Priya Sharma',
          email: 'priya.sharma@studentportal.com',
          phone: '9876543211',
          department_id: eceDept.id,
          must_change_password: false
        })
        .select()
        .single();
      teacher2 = data;
      console.log('Teacher created: teacher_id=T10002, password=Teacher@123, dept=ECE');
    } else {
      teacher2 = existingTeacher2;
      console.log('Teacher T10002 already exists');
    }

    console.log('Creating student accounts...');
    const studentPasswordHash = await bcrypt.hash('Student@123', 10);

    const cseStudents = [
      {
        student_id: '2024001',
        full_name: 'Amit Patel',
        email: 'amit.patel@student.com',
        semester: 3,
        year: 2024,
        batch: '2024-2028',
        department_id: cseDept.id,
        password_hash: studentPasswordHash,
        must_change_password: false,
        created_by_teacher_id: teacher1.id
      },
      {
        student_id: '2024002',
        full_name: 'Sneha Reddy',
        email: 'sneha.reddy@student.com',
        semester: 3,
        year: 2024,
        batch: '2024-2028',
        department_id: cseDept.id,
        password_hash: studentPasswordHash,
        must_change_password: false,
        created_by_teacher_id: teacher1.id
      },
      {
        student_id: '2024003',
        full_name: 'Rahul Verma',
        email: 'rahul.verma@student.com',
        semester: 3,
        year: 2024,
        batch: '2024-2028',
        department_id: cseDept.id,
        password_hash: studentPasswordHash,
        must_change_password: false,
        created_by_teacher_id: teacher1.id
      }
    ];

    const eceStudents = [
      {
        student_id: '2024004',
        full_name: 'Priyanka Singh',
        email: 'priyanka.singh@student.com',
        semester: 3,
        year: 2024,
        batch: '2024-2028',
        department_id: eceDept.id,
        password_hash: studentPasswordHash,
        must_change_password: false,
        created_by_teacher_id: teacher2.id
      },
      {
        student_id: '2024005',
        full_name: 'Vikram Rao',
        email: 'vikram.rao@student.com',
        semester: 3,
        year: 2024,
        batch: '2024-2028',
        department_id: eceDept.id,
        password_hash: studentPasswordHash,
        must_change_password: false,
        created_by_teacher_id: teacher2.id
      },
      {
        student_id: '2024006',
        full_name: 'Anjali Desai',
        email: 'anjali.desai@student.com',
        semester: 3,
        year: 2024,
        batch: '2024-2028',
        department_id: eceDept.id,
        password_hash: studentPasswordHash,
        must_change_password: false,
        created_by_teacher_id: teacher2.id
      }
    ];

    for (const student of [...cseStudents, ...eceStudents]) {
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('student_id', student.student_id)
        .maybeSingle();

      if (!existing) {
        await supabase.from('students').insert(student);
        console.log(`Student created: student_id=${student.student_id}, password=Student@123`);
      } else {
        console.log(`Student ${student.student_id} already exists`);
      }
    }

    console.log('Creating subjects...');
    const cseSubjects = [
      { code: 'CS301', name: 'Data Structures', department_id: cseDept.id },
      { code: 'CS302', name: 'Database Management Systems', department_id: cseDept.id }
    ];

    const eceSubjects = [
      { code: 'EC301', name: 'Digital Electronics', department_id: eceDept.id },
      { code: 'EC302', name: 'Signal Processing', department_id: eceDept.id }
    ];

    const allSubjects = [];
    for (const subject of [...cseSubjects, ...eceSubjects]) {
      const { data: existing } = await supabase
        .from('subjects')
        .select('id')
        .eq('code', subject.code)
        .eq('department_id', subject.department_id)
        .maybeSingle();

      if (!existing) {
        const { data } = await supabase
          .from('subjects')
          .insert(subject)
          .select()
          .single();
        allSubjects.push(data);
        console.log(`Subject created: ${subject.code} - ${subject.name}`);
      } else {
        allSubjects.push(existing);
        console.log(`Subject ${subject.code} already exists`);
      }
    }

    console.log('Adding marks...');
    const { data: students } = await supabase
      .from('students')
      .select('*');

    const cseSubjectIds = allSubjects.filter(s => s.code.startsWith('CS')).map(s => s.id);
    const eceSubjectIds = allSubjects.filter(s => s.code.startsWith('EC')).map(s => s.id);

    const exams = ['Midterm Exam', 'Final Exam'];

    for (const student of students) {
      const subjectIds = student.student_id.startsWith('202400') && parseInt(student.student_id) <= 2024003
        ? cseSubjectIds
        : eceSubjectIds;

      const teacherId = student.created_by_teacher_id;

      for (const subjectId of subjectIds) {
        for (const exam of exams) {
          const { data: existingMark } = await supabase
            .from('marks')
            .select('id')
            .eq('student_id', student.id)
            .eq('subject_id', subjectId)
            .eq('exam_name', exam)
            .maybeSingle();

          if (!existingMark) {
            const marks = Math.floor(Math.random() * 30) + 60;
            await supabase
              .from('marks')
              .insert({
                student_id: student.id,
                subject_id: subjectId,
                exam_name: exam,
                marks: marks,
                max_marks: 100,
                created_by_teacher_id: teacherId
              });
          }
        }
      }
    }

    console.log('Marks added for all students');

    console.log('\n=== Seeding completed successfully! ===\n');
    console.log('Login credentials:');
    console.log('----------------------------------');
    console.log('ADMIN:');
    console.log('  Username: admin');
    console.log('  Password: Admin@123');
    console.log('----------------------------------');
    console.log('TEACHERS:');
    console.log('  Teacher ID: T10001');
    console.log('  Password: Teacher@123');
    console.log('  Department: Computer Science and Engineering');
    console.log('');
    console.log('  Teacher ID: T10002');
    console.log('  Password: Teacher@123');
    console.log('  Department: Electronics and Communication Engineering');
    console.log('----------------------------------');
    console.log('STUDENTS (all use password: Student@123):');
    console.log('  2024001, 2024002, 2024003 (CSE)');
    console.log('  2024004, 2024005, 2024006 (ECE)');
    console.log('----------------------------------\n');

  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
