const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './ptms.sqlite',
  logging: false
});

// User - common fields (Tutor / Learner / Admin)
const User = sequelize.define('User', {
  name: { type: DataTypes.STRING, allowNull:false },
  email: { type: DataTypes.STRING, allowNull:false, unique:true },
  password: { type: DataTypes.STRING, allowNull:false },
  role: { type: DataTypes.STRING, allowNull:false } // 'Tutor', 'Learner', 'Admin'
});

// Tutor (extra fields)
const Tutor = sequelize.define('Tutor', {
  subjects: { type: DataTypes.STRING }, // comma-separated list for prototype
  availability: { type: DataTypes.STRING },
  rating: { type: DataTypes.FLOAT, defaultValue: 0 }
});

// Learner (placeholder for future learner-specific fields)
const Learner = sequelize.define('Learner', {});

// Session entity
const Session = sequelize.define('Session', {
  date: { type: DataTypes.STRING },
  time: { type: DataTypes.STRING },
  subject: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'Pending' } // Pending, Accepted, Rejected, Completed
});

// Feedback
const Feedback = sequelize.define('Feedback', {
  rating: { type: DataTypes.INTEGER },
  comment: { type: DataTypes.TEXT }
});

// Notification
const Notification = sequelize.define('Notification', {
  message: { type: DataTypes.STRING },
  read: { type: DataTypes.BOOLEAN, defaultValue: false }
});

// Associations
User.hasOne(Tutor, { foreignKey: 'userId' });
Tutor.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(Learner, { foreignKey: 'userId' });
Learner.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Notification, { foreignKey: 'userId' });
Notification.belongsTo(User, { foreignKey: 'userId' });

Learner.hasMany(Session, { foreignKey: 'learnerId' });
Session.belongsTo(Learner, { foreignKey: 'learnerId' });

Tutor.hasMany(Session, { foreignKey: 'tutorId' });
Session.belongsTo(Tutor, { foreignKey: 'tutorId' });

Session.hasOne(Feedback, { foreignKey: 'sessionId' });
Feedback.belongsTo(Session, { foreignKey: 'sessionId' });

module.exports = { sequelize, User, Tutor, Learner, Session, Feedback, Notification };
