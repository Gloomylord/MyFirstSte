var nunjucks = require('nunjucks');
const bodyParser = require("body-parser");

var express = require('express'),
    cookieParser = require('cookie-parser'),
    cookieSession = require('cookie-session');

const multer = require("multer");
const User = require('./models.js').User;
const Question = require('./models.js').Question;
const Answer = require('./models.js').Answer;
const Op = require('./models.js').Op;
const Tag = require('./models.js').Tag;
const IsLikeAnswer = require('./models.js').IsLikeAnswer;
const IsLikeQuestion = require('./models.js').IsLikeQuestion;
const csrf = require('csurf');
var csrfProtection = csrf({cookie: true});
var parseForm = bodyParser.urlencoded({extended: false});
const sequelize = require('./models.js').sequelize;
sequelize.sync().then(result => {
})
    .catch(err => console.log(err));
const flash = require('connect-flash');
const passport = require("passport");
const session = require('express-session');
const localStrategy = require('passport-local').Strategy;
const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "static/uploads");
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
var app = express();
var expressWs = require('express-ws')(app);
app.use(cookieParser());
app.use(bodyParser.json());
app.use(parseForm);
const csrfMiddleware = csrf({cookie: true});
app.use(csrfMiddleware);
app.use(flash());
app.set('views', './views');
app.use(express.static('./static'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(multer({storage: storageConfig}).single("filedata"));
app.use(bodyParser.json());
nunjucks.configure('views', {
    autoescape: true,
    express: app,
    watch: true
});
app.use(session({secret: 'you secret key', resave: true, saveUninitialized: true}))
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
    done(null, user.email);
});

passport.deserializeUser(function (email, done) {
    User.findOne({where: {email: email}}).then((user) => {
        return done(null, user);
    }).catch(function (err) {
        return done(err);
    });
});

sequelize.options.logging = false;

app.use(function (req, res, next) {
    var token = req.csrfToken();
    res.cookie('XSRF-TOKEN', token);
    res.locals.csrfToken = token;
    res.locals.popTags = popTags;
    res.locals.popUsers = popUsers;
    next();
});

function splitTags(mass) {
    if (mass.includes(" ")) {
        if (mass.includes(",")) {
            let pos = -1;
            while ((pos = mass.indexOf(" ")) != -1) {
                mass = mass.slice(0, pos) + mass.slice(pos + 1);
            }
            mass = mass.split(",");
        } else {
            mass = mass.split(" ");
        }
    } else {
        mass = mass.split(",");
    }
    return mass;
}

const clients = new Set();
passport.use(
    new localStrategy({
        passReqToCallback: true, usernameField: 'email',
        passwordField: 'password'
    }, (req, email, password, done) => {
        console.log(email, password);

        User.findOne({where: {email: email}})
            .then(user => {
                if (!user) return done(null, false, {message: 'User not found'});
                if (email !== user.email) {
                    console.log("User not found");
                    return done(null, false, {message: 'User not found'});
                } else if (password !== user.password) {
                    console.log("Wrong password");
                    return done(null, false, {message: 'Wrong password'});
                }
                return done(null, user)
            }).catch(err => console.log(err));
    })
);

app.get('/login', function (req, res) {
    if (!req.user) {
        res.render('Log in.html');
    } else {
        res.redirect('/settings');
    }
});

app.post('/login', passport.authenticate('local', {
        successRedirect: '/newquestion',
        failureRedirect: '/login',
        failureFlash: true
    })
);

let popTags;
let popUsers;

function findPopTags() {
    Tag.findAll({
        attributes: {
            include: [[sequelize.fn("COUNT", sequelize.col("questions.id")), "questionsCount"]]
        },
        include: {
            model: Question,
            attributes: []
        },
        group: ['tag.id'],
        limit: 5, subQuery: false,
        raw: true,
        order: [[sequelize.literal('questionsCount'), 'DESC']]
    }).then(tags => {
        popTags = tags;
    }).catch(err => {
        console.log(err);
    });
}

function findPopUsers() {
    User.findAll({
        attributes: {
            include: [[sequelize.fn("COUNT", sequelize.col("user.id")), "answersCount"]]
        },
        include: {
            model: Answer,
            attributes: []
        },
        group: ['user.id'],
        limit: 5, subQuery: false,
        raw: true,
        order: [[sequelize.literal('answersCount'), 'DESC']]
    }).then(users => {
        popUsers = users;
    }).catch(err => {
        console.log(err);
    });
}

findPopTags();
findPopUsers();

app.get('/search', function (req, res) {
    if (!req.query.some) {
        Question.findAll({
            attributes: {
                include: [[sequelize.fn("COUNT", sequelize.col("answers.id")), "answerCount"]]
            },
            include: {
                model: Answer,
                attributes: []
            },
            group: ['id'],
            raw: true,
            order: [['id', 'DESC']]
        }).then(async questions => {
            let nam = Array.from(questions).length;
            let size = 8;
            if (req.query.page) {
                if (req.query.page * size <= nam) {
                    questions = Array.from(questions).slice((req.query.page - 1) * size, req.query.page * size);
                } else {
                    questions = Array.from(questions).slice((req.query.page - 1) * size, nam);
                }
            } else {
                questions = Array.from(questions).slice(0, size);
            }
            for (let i in questions) {
                await Question.findOne({
                    where: {
                        id: questions[i].id
                    },
                    include: [User]
                }).then(async question => {
                    if (question.user.url) {
                        questions[i].url = question.user.url;
                    }

                    await IsLikeQuestion.findAll({
                        where: {questionId: questions[i].id},
                        attributes: {
                            include: [[sequelize.fn("SUM", sequelize.col("islikequestion.grade")), "IsLikeQuestionSum"]]
                        },
                        group: ['islikequestion.questionId']
                    }).then(result => {
                        if (!result[0]) {
                            questions[i].IsLikeQuestionSum = 0;
                        } else {
                            questions[i].IsLikeQuestionSum = result[0].dataValues.IsLikeQuestionSum;
                        }
                    }).catch(err => console.log(err));

                    await question.getTags({where: {name: {[Op.ne]: ''}}}).then(tags => {
                        if (tags) {
                            if (tags == [] || tags == '') {
                                questions[i].tags = false;
                            } else {
                                questions[i].tags = tags;
                            }
                        } else {
                            questions[i].tags = false;
                        }
                    }).catch(err => console.log('тут начало', err, 'тут конец'));
                })
            }

            if (nam > size) {
                res.render('NewQuestionSearch.html', {user: req.user, questions, nam});
            } else {
                res.render('NewQuestionSearch.html', {user: req.user, questions, nam: 0});
            }
        }).catch(err => {
            console.log('тут начало', err, 'тут конец');
            res.render('NewQuestionSearch.html', {user: req.user, err});
        });
    } else {

        let t = splitTags(req.query.some);
        let mass = [];

        Tag.findAll({where: {name: t}}).then(async tags => {
            console.log('теги  ', tags);
            if (!tags) {
                res.render('TagsNotFound.html');
            } else {

                for (let i of tags) {
                    await i.getQuestions().then(questions => {
                        console.log(questions);
                        if (questions == []) {
                            res.render('TagsNotFound.html', {err: "Извиние, вопросы по данному тегу были удалены"});
                        } else {
                            for (let n of questions) {
                                mass.push(n);
                            }
                        }
                    }).catch(err => console.log(err));
                }

                let nam = Array.from(mass).length;
                let size = 8;
                if (req.query.page) {
                    if (req.query.page * size <= nam) {
                        mass = Array.from(mass).slice((req.query.page - 1) * size, req.query.page * size);
                    } else {
                        mass = Array.from(mass).slice((req.query.page - 1) * size, nam);
                    }
                } else {
                    mass = Array.from(mass).slice(0, size);
                }
                for (let i in mass) {
                    console.log('mass id:', mass[i].id)
                    await Question.findOne({
                        where: {
                            id: mass[i].id
                        },
                        include: [User]
                    }).then(async question => {
                        if (question.user.url) {
                            mass[i].url = question.user.url;
                        }

                        await IsLikeQuestion.findAll({
                            where: {questionId: mass[i].id},
                            attributes: {
                                include: [[sequelize.fn("SUM", sequelize.col("islikequestion.grade")), "IsLikeQuestionSum"]]
                            },
                            group: ['islikequestion.questionId']
                        }).then(result => {

                            if (!result[0]) {
                                mass[i].IsLikeQuestionSum = 0;
                            } else {
                                mass[i].IsLikeQuestionSum = result[0].dataValues.IsLikeQuestionSum;
                            }
                        }).catch(err => console.log(err));

                        await question.getTags({where: {name: {[Op.ne]: ''}}}).then(tags => {
                            if (tags) {
                                if (tags == [] || tags == '') {
                                    mass[i].tags = false;
                                } else {
                                    mass[i].tags = tags;
                                }
                            } else {
                                mass[i].tags = false;
                            }
                        }).catch(err => console.log('тут начало', err, 'тут конец'));

                        await Question.findAll({
                            where: {id: mass[i].id},
                            attributes: {
                                include: [[sequelize.fn("COUNT", sequelize.col("answers.id")), "answerCount"]]
                            },
                            include: {
                                model: Answer,
                                attributes: []
                            },
                            group: ['id'],
                            raw: true,
                            order: [['id', 'DESC']]
                        }).then(question => {
                            mass[i].answerCount = question[0].answerCount;
                        }).catch(err => console.log(err));

                    }).catch(err => console.log(err));
                }

                if (nam > size) {
                    res.render('NewQuestionSearch.html', {user: req.user, questions: mass, nam, some: req.query.some});
                } else {
                    res.render('NewQuestionSearch.html', {
                        user: req.user,
                        questions: mass,
                        nam: 0,
                        some: req.query.some
                    });
                }

            }
        }).catch(err => {
            console.log(err)
        });
    }

});

app.post('/article', async function (req, res) {
    let a;
    if (req.body.like == '+') {
        a = 1;
    } else if (req.body.like == '-') {
        a = -1;
    }
    let obj = {grade: a};
    await IsLikeQuestion.findOne({
        where: {
            questionId: req.body.id,
            userId: req.user.id
        }
    }).then(async like => {
        if (!like) {
            obj.last = false;
            await IsLikeQuestion.create({userId: req.user.id, grade: a, questionId: req.body.id});
        } else {
            console.log('уже есть', like.grade)
            obj.lastGrade = like.grade;
            obj.last = true;
            await IsLikeQuestion.update({grade: a}, {
                where: {
                    questionId: req.body.id,
                    userId: req.user.id
                }
            }).then((res) => {
                console.log(res);
            });
        }
    })
    res.json(obj);
});
app.post('/correct', async function (req, res) {
    if (req.body.id) {
        await Answer.update({correct: req.body.correct}, {
            where: {
                id: req.body.id
            }
        }).then((res) => {
            console.log(res);
        });

        res.json({correct: req.body.correct});
    }
});


app.post('/articlea', async function (req, res) {
    let a;
    if (req.body.like == '+') {
        a = 1;
    } else if (req.body.like == '-') {
        a = -1;
    }
    let obj = {grade: a};
    console.log("Запуск", a)
    await IsLikeAnswer.findOne({
        where: {
            answerId: req.body.id,
            userId: req.user.id
        }
    }).then(like => {
        console.log(like, 'kjb');
        if (!like) {
            IsLikeAnswer.create({userId: req.user.id, grade: a, answerId: req.body.id}).catch(err => console.log(err));
        } else {
            obj.lastGrade = like.grade;
            console.log('уже есть')
            IsLikeAnswer.update({grade: a}, {
                where: {
                    answerId: req.body.id,
                    userId: req.user.id
                }
            }).then((res) => {
                console.log(res);
            });
        }
    })
    res.json(obj);
});

app.get('/registration', function (req, res) {
    res.render('Registration.html', {user: req.user});
});

app.post('/registration', parseForm, csrfProtection, function (req, res) {
    console.log(req.body.firstName, 'qwer', req.body.surname, 'qwer', req.body.age, 'qwer', req.body.password, 'qwer', req.body.password)
    if (req.body.password == req.body.repeatPassword) {
        let a = {
            age: req.body.age,
            surname: req.body.surname,
            firstName: req.body.firstName,
            email: req.body.email,
            password: req.body.password
        }
        console.log(a);
        User.create(a).then(async user => {
            if (req.file) {
                console.log(req.file.originalname);
                await User.update({url: `/uploads/${req.file.originalname}`}, {
                    where: {
                        email: req.body.email
                    }
                }).then((user) => {
                    console.log('BOOM', user, "BOOM");
                });

            }
            res.redirect('/login');
        }).catch(err => {
            console.log(err);
            error = 'Данные были введены не верно.'
            res.render('Registration.html', {error});
        });
    } else {
        console.log('сюда надо');
        error = 'Пароли не совпадают.'
        res.render('Registration.html', {error})
    }
});

app.get('/settings', function (req, res) {
    if (req.user) {
        res.render('Settings.html', {user: req.user});
    } else {
        res.redirect('/login');
    }
});

app.post('/settings', parseForm, csrfProtection, async function (req, res) {
    console.log("Зашел", req.body.firstName, req.body.surename);
    if (req.user.id) {
        await User.findOne({
                where: {
                    id: req.user.id
                }
            }
        ).then(async user => {
            console.log('name:' + req.body.firstName);
            if (req.body.firstName) {
                await User.update({firstName: req.body.firstName}, {
                    where: {
                        email: user.email
                    }
                });
            }
            if (req.file) {
                console.log(req.file.originalname);
                await User.update({url: `/uploads/${req.file.originalname}`}, {
                    where: {
                        email: user.email
                    }
                });
            }
            console.log('surname:' + req.body.firstName);
            if (req.body.surename) {
                await User.update({surname: req.body.surename}, {
                    where: {
                        email: user.email
                    }
                }).then((user) => {

                });
            }
            if (req.body.age) {
                await User.update({age: req.body.age}, {
                    where: {
                        email: user.email
                    }
                });
            }
        }).catch(err => console.log(err));
    }
    res.redirect('/settings');

});

app.get('/newquestion', function (req, res) {
    res.render('NewQuestion.html', {user: req.user});
});

app.get('/user/:userId', async function (req, res) {
    if (req.params.userId) {
        await User.findOne({
            where: {id: req.params.userId},
            attributes: {
                include: [[sequelize.fn("COUNT", sequelize.col("questions.id")), "questionCount"]]
            },
            include: {
                model: Question,
                attributes: []
            }
        }).then(async user1 => {
            await User.findOne({
                where: {id: req.params.userId},
                attributes: {
                    include: [[sequelize.fn("COUNT", sequelize.col("answers.id")), "answerCount"]]
                },
                include: {
                    model: Answer,
                    attributes: []
                }
            }).then(user => {
                user1.answerCount = user.dataValues.answerCount;
                console.log(user1);
                res.render('UserPage.html', {user: req.user, user1});
            });


        }).catch(err => console.log(err));

    }
});

app.post('/newquestion', async function (req, res) {
    if (req.user) {
        if (req.body.title == '' && req.body.question == '') {
            res.redirect('/newquestio?t=null');
        } else {
            await Question.create({title: req.body.title, question: req.body.question, userId: req.user.id}
            ).then(async (question) => {
                let mass = splitTags(req.body.tags);
                for (let i of mass) {
                    Tag.findOne({where: {name: i}}).then(tag => {
                        if (!tag) {
                            Tag.create({name: i}).then(tag => {
                                question.addTag(tag, {through: {grade: 1}});
                            }).catch(err => console.log(err));
                        } else {
                            question.addTag(tag, {through: {grade: 1}});
                        }
                    }).catch(err => console.log(err));
                }
            }).catch(err => {
                console.log(err);

                res.render('NewQuestion.html', {user: req.user});
            });
        }
        res.redirect('/search');
    } else {
        let err = "Залогинтесь, чтобы задать вопрос";
        res.render('Log in.html', {err});
    }


});

app.get('/answer/:tagId', function (req, res) {
    Question.findOne({where: {id: req.params.tagId}, include: [User]}).then(question => {
        if (!question) {
            return res.render('NotFound404.html');
        }
        question.getAnswers({order: [['id', 'DESC']], include: [User]}).then(async answers => {
            await question.getTags({where: {name: {[Op.ne]: ''}}}).then(tags => {
                if (tags) {
                    if (tags == [] || tags == '') {
                        question.tags = false;
                    } else {
                        question.tags = tags;
                    }
                } else {
                    question.tags = false;
                }
            }).catch(err => console.log(err));

            await IsLikeQuestion.findAll({
                where: {questionId: question.id},
                attributes: {
                    include: [[sequelize.fn("SUM", sequelize.col("islikequestion.grade")), "IsLikeQuestionSum"]]
                },
                group: ['islikequestion.questionId']
            }).then(result => {
                if (!result[0]) {
                    question.IsLikeQuestionSum = 0;
                } else {
                    question.IsLikeQuestionSum = result[0].dataValues.IsLikeQuestionSum;
                }
            }).catch(err => console.log(err));
            let nam = Array.from(answers).length;
            let size = 5;
            if (!answers || answers == []) res.render('Answers.html', {
                user: req.user,
                question: question.dataValues,
                nam: 0
            });
            if (req.query.page) {
                if (req.query.page * size <= nam) {
                    answers = Array.from(answers).slice((req.query.page - 1) * size, req.query.page * size);
                } else {
                    answers = Array.from(answers).slice((req.query.page - 1) * size, nam);
                }
            } else {
                answers = Array.from(answers).slice(0, size)
            }
            for (let i in answers) {
                await IsLikeAnswer.findAll({
                    where: {answerId: answers[i].id},
                    attributes: {
                        include: [[sequelize.fn("SUM", sequelize.col("islikeanswer.grade")), "IsLikeAnswerSum"]]
                    },
                    group: ['islikeanswer.answerId']
                }).then(result => {
                    if (!result[0]) {
                        answers[i].IsLikeAnswerSum = 0;
                    } else {
                        answers[i].IsLikeAnswerSum = result[0].dataValues.IsLikeAnswerSum;
                    }
                }).catch(err => console.log(err));
            }
            if (nam > size) {
                res.render('Answers.html', {user: req.user, question, nam, answers});
            } else {
                res.render('Answers.html', {user: req.user, question, nam: 0, answers});
            }
        }).catch(err => console.log(err));
    }).catch(err => console.log('тут начало', err, 'тут конец'));
});

app.post('/answer/:tagId', function (req, res) {
    Question.findByPk(req.params.tagId).then(async (question) => {
        if (req.body) {
            if (req.user) {
                await Answer.create({questionId: req.params.tagId, userId: req.user.id, answer: req.body.answer});
                let obj = {questionId: req.params.tagId, answer: req.body.answer};
                await User.findOne({where: {id: req.user.id}}).then(async user => {
                    obj.url = user.url;
                    obj.fullName = user.firstName + ' ' + user.surname;
                });

                for (let client of clients) {
                    client.send(JSON.stringify(obj));
                }
                main(req.params.tagId, req.user.id, req.body.answer).catch(err => console.log('вот тут:', err));
            } else {
                let err = 'Залогинтесь, чтобы ответить на вопрос'
                res.redirect('/login', {err});
            }
        }

        res.redirect(`/answer/${req.params.tagId}`);
    }).catch(err => console.log(err));
});

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/login');
});

app.ws('/echo', (ws, req) => {
    clients.add(ws);

    ws.on('message', async function (message) {

    });
    ws.on('close', function () {
        console.log(`подключение закрыто`);
        clients.delete(ws);
    });
})
"use strict";
const nodemailer = require("nodemailer");


(async function () {
    let testAccount = await nodemailer.createTestAccount();

    const transport = nodemailer.createTransport({
        port: 1025,
        ignoreTLS: true,
    });

    await transport.sendMail({
        from: 'twertwert@ya.ru', // sender address
        to: 'useremailQuestion@ya.ru', // list of receivers
        subject: "Наваш вопрос ответили", // Subject line
        text: 'text', // plain text body
        html: "text" // html body
    });
})();


// async..await is not allowed in global scope, must use a wrapper
async function main(questionId, userIdAnswer, answer) {
    console.log('Запуск');
    // Generate test SMTP service account from ethereal.email
    // Only needed if you don't have a real mail account for testing
    let testAccount = await nodemailer.createTestAccount();

    // create reusable transporter object using the default SMTP transport
    const transport = nodemailer.createTransport({
        port: 1025,
        ignoreTLS: true,
    });

    let useremailQuestion;
    let userNameAnswer;

    await Question.findOne({where: {id: questionId}}).then(async question => {
        await User.findOne({where: {id: question.userId}}).then(userq => {
            useremailQuestion = userq.email;
            console.log(useremailQuestion);
        });
    });

    await User.findOne({where: {id: userIdAnswer}}).then(userq => {
        userNameAnswer = userq.firstName + ' ' + userq.surname;
        console.log(userNameAnswer);
    });
    console.log('find answer');

    let info = await transport.sendMail({
        from: 'twertwert@ya.ru', // sender address
        to: useremailQuestion, // list of receivers
        subject: "На ваш вопрос ответили", // Subject line
        text: `Ответил ${userNameAnswer} Ответ: ${answer}`, // plain text body
        html: `<b>Ответил ${userNameAnswer} <br> Ответ: ${answer}</br>` // html body
    });
    console.log('end');

}

app.get('*', function(req, res){
    res.render('NotFound404.html');
});

app.listen(3000, function (res, req) {
    console.log('Example app listening on port 3000!');
});
