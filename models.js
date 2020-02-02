const Sequelize = require("sequelize");
const sequelize = new Sequelize("mysite", "siteUser", "password", {
    dialect: "mysql",
    host: "localhost"
});

const Op = Sequelize.Op;
const operatorsAliases = {
    $eq: Op.eq,
    $ne: Op.ne,
    $gte: Op.gte,
    $gt: Op.gt,
    $lte: Op.lte,
    $lt: Op.lt,
    $not: Op.not,
    $in: Op.in,
    $notIn: Op.notIn,
    $is: Op.is,
    $like: Op.like,
    $notLike: Op.notLike,
    $iLike: Op.iLike,
    $notILike: Op.notILike,
    $regexp: Op.regexp,
    $notRegexp: Op.notRegexp,
    $iRegexp: Op.iRegexp,
    $notIRegexp: Op.notIRegexp,
    $between: Op.between,
    $notBetween: Op.notBetween,
    $overlap: Op.overlap,
    $contains: Op.contains,
    $contained: Op.contained,
    $adjacent: Op.adjacent,
    $strictLeft: Op.strictLeft,
    $strictRight: Op.strictRight,
    $noExtendRight: Op.noExtendRight,
    $noExtendLeft: Op.noExtendLeft,
    $and: Op.and,
    $or: Op.or,
    $any: Op.any,
    $all: Op.all,
    $values: Op.values,
    $col: Op.col
};

const User = sequelize.define("user", {

    firstName: {
        type: Sequelize.STRING,
        allowNull: false
    },
    surname: {
        type: Sequelize.STRING,
        allowNull: false
    },
    age: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    password: {
        type: Sequelize.STRING,
        allowNull: false
    },
    email: {
        unique: true,
        type: Sequelize.STRING,
        allowNull: false
    },
    url: {
        type: Sequelize.STRING,
        allowNull: true
    }
});
const Question = sequelize.define("question", {

    title: {
        type: Sequelize.STRING,
        allowNull: false
    },
    question: {
        type: Sequelize.TEXT,
        allowNull: false
    }
});
const Answer = sequelize.define("answer", {

    answer: {
        type: Sequelize.STRING,
        allowNull: true
    },
    correct: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: false
    }
});

const Tag = sequelize.define("tag", {

    name: {
        unique: true,
        type: Sequelize.STRING,
        allowNull: true
    }

});

const Enrolment = sequelize.define("enrolment", {

    grade: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
});

const IsLikeQuestion = sequelize.define("islikequestion", {

    grade: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
});

const IsLikeAnswer = sequelize.define("islikeanswer", {

    grade: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
});
Question.hasMany(IsLikeQuestion);
User.hasMany(IsLikeQuestion);
IsLikeQuestion.belongsTo(User);
IsLikeQuestion.belongsTo(Question);

Answer.hasMany(IsLikeAnswer);
User.hasMany(IsLikeAnswer);
IsLikeAnswer.belongsTo(User);
IsLikeAnswer.belongsTo(Answer);

Question.hasMany(Answer);

User.hasMany(Answer);
User.hasMany(Question);
Answer.belongsTo(User);
Question.belongsTo(User);
Answer.belongsTo(Question);

Question.belongsToMany(Tag, {through: Enrolment});
Tag.belongsToMany(Question, {through: Enrolment});

module.exports.Op = Op;
module.exports.Question = Question;
module.exports.sequelize = sequelize;
module.exports.User = User;
module.exports.Answer = Answer;
module.exports.Tag = Tag;
module.exports.IsLikeQuestion = IsLikeQuestion;
module.exports.IsLikeAnswer = IsLikeAnswer;
