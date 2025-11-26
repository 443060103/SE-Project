const { sequelize, User, Tutor, Learner } = require('./models');

(async ()=>{
  await sequelize.sync({ force: true });
  // sample tutors and learner
  const u1 = await User.create({ name:'Alice Tutor', email:'alice@uni.edu', password:'pass123', role:'Tutor' });
  await Tutor.create({ userId: u1.id, subjects: 'Data Structures,Algorithms', availability: 'MWF 6-8' });

  const u2 = await User.create({ name:'Bob Learner', email:'bob@uni.edu', password:'pass123', role:'Learner' });
  await Learner.create({ userId: u2.id });

  const u3 = await User.create({ name:'Carol Tutor', email:'carol@uni.edu', password:'pass123', role:'Tutor' });
  await Tutor.create({ userId: u3.id, subjects: 'Operating Systems,Computer Networks', availability: 'TTh 4-6' });

  // Admin user for Level 1 admin panel
  const admin = await User.create({ name:'Site Admin', email:'admin@uni.edu', password:'admin123', role:'Admin' });

  console.log('Seeded sample data (alice, bob, carol) and admin (admin@uni.edu / admin123).');
  process.exit(0);
})();
