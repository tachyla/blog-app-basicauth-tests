const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {DATABASE_URL} = require('../config');
const {BlogPost, User} = require('../models');
const {closeServer, runServer, app} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  ata from one test does not stick
// around for next one
function tearDownDb() {
  return new Promise((resolve, reject) => {
    console.warn('Deleting database');
    mongoose.connection.dropDatabase()
      .then(result => resolve(result))
      .catch(err => reject(err));
  });
}


// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding blog post data');
  const seedData = [];
  for (let i=1; i<=10; i++) {
    seedData.push({
      author: {
        firstName: faker.name.firstName(),
        lastName: faker.name.lastName()
      },
      title: faker.lorem.sentence(),
      content: faker.lorem.text()
    });
  }
  // this will return a promise
  return BlogPost.insertMany(seedData);
}
const testUser = {};

function seedUserData() {
  console.log('seeding user data');

  const sampleUser = {
    username: 'user1',
    firstName: 'Bob',
    lastName: 'user',
    password: '123'};
    
  return User.hashPassword(sampleUser.password)
    .then(hash => {
      return User
      .create({
        username: 'user1',
        firstName: 'Bob',
        lastName: 'user',
        password: hash
      });
    })
    .then(result => {
      testUser.username = result.username;
      testUser.password = sampleUser.password;
      testUser.firstName = result.firstName;
      testUser.lastName = result.lastName;
      return true;
    });
}

  

  



describe('blog posts API resource', function() {

  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  // beforeEach(function(){
  //   return seedUserData();
  // });

  beforeEach(function() {
    Promise.all([seedUserData(), seedBlogPostData()]);
  });


  afterEach(function() {
    // tear down database so we ensure no state from this test
    // effects any coming after.
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    // beforeEach(function(){
    //   return seedUserData();
    // });
    it('should return all existing posts', function() {
      // strategy:
      //    1. get back all posts returned by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of posts we got back is equal to number
      //       in db.
      let res;
      return chai.request(app)
        .get('/posts')
        .then(_res => {
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.should.have.length.of.at.least(1);

          return BlogPost.count();
        })
        .then(count => {
          // the number of returned posts should be same
          // as number of posts in DB
          res.body.should.have.length.of(count);
        });
    });

    it('should return posts with right fields', function() {
      // Strategy: Get back all posts, and ensure they have expected keys

      let resPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {

          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(post) {
            post.should.be.a('object');
            post.should.include.keys('id', 'title', 'content', 'author', 'created');
          });
          // just check one of the posts that its values match with those in db
          // and we'll assume it's true for rest
          resPost = res.body[0];
          return BlogPost.findById(resPost.id).exec();
        })
        .then(post => {
          resPost.title.should.equal(post.title);
          resPost.content.should.equal(post.content);
          resPost.author.should.equal(post.authorName);
        });
    });
  });

  describe('POST endpoint', function() {

    // beforeEach(function(){
    //   return seedUserData();
    // });

    // strategy: make a POST request with data,
    // then prove that the post we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog post', function() {

      const newPost = {
        title: faker.lorem.sentence(),
        author: {
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        },
        content: faker.lorem.text()
      };

      return chai.request(app)
        .post('/posts')
        .send(newPost)
        .auth(testUser.username, testUser.password)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'title', 'content', 'author', 'created');
          res.body.title.should.equal(newPost.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.author.should.equal(
            `${newPost.author.firstName} ${newPost.author.lastName}`);
          res.body.content.should.equal(newPost.content);
          return BlogPost.findById(res.body.id).exec();
        })
        .then(function(post) {
          post.title.should.equal(newPost.title);
          post.content.should.equal(newPost.content);
          post.author.firstName.should.equal(newPost.author.firstName);
          post.author.lastName.should.equal(newPost.author.lastName);
        });
    });
  });

  describe('PUT endpoint', function() {

    // beforeEach(function(){
    //   return seedUserData();
    // });
    // strategy:
    //  1. Get an existing post from db
    //  2. Make a PUT request to update that post
    //  3. Prove post returned by request contains data we sent
    //  4. Prove post in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        title: 'cats cats cats',
        content: 'dogs dogs dogs',
        author: {
          firstName: testUser.firstName,
          lastName: testUser.lastName
        }
      };

      return BlogPost
        .findOne()
        .exec()
        .then(post => {
          updateData.id = post.id;

          return chai.request(app)
            .put(`/posts/${post.id}`)
            .send(updateData)
            .auth(testUser.username, testUser.password);
        })
        .then(res => {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.title.should.equal(updateData.title);
          // res.body.author.should.equal( this test should never work - the put endpoint should never update user data, only title and content
          //   `${updateData.author.firstName} ${updateData.author.lastName}`);
          res.body.content.should.equal(updateData.content);

          return BlogPost.findById(res.body.id).exec();
        })
        .then(post => {
          post.title.should.equal(updateData.title);
          post.content.should.equal(updateData.content);
          // post.author.firstName.should.equal(updateData.author.firstName);
          // post.author.lastName.should.equal(updateData.author.lastName);
        });
    });
  });

  describe('DELETE endpoint', function() {
    // beforeEach(function(){
    //   return seedUserData();
    // });
    // strategy:
    //  1. get a post
    //  2. make a DELETE request for that post's id
    //  3. assert that response has right status code
    //  4. prove that post with the id doesn't exist in db anymore
    it('should delete a post by id', function() {

      let post;

      return BlogPost
        .findOne()
        .exec()
        .then(_post => {
          post = _post;
          return chai.request(app).delete(`/posts/${post.id}`).auth(testUser.username, testUser.password);
        })
        .then(res => {
          res.should.have.status(204);
          return BlogPost.findById(post.id);
        })
        .then(_post => {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_post.should.be.null` would raise
          // an error. `should.be.null(_post)` is how we can
          // make assertions about a null value.
          should.not.exist(_post);
        });
    });
  });
  describe('POST users', function(){
    let testPost = {
      username: 'frank',
      password: 'franklin',
      firstName: 'Francis',
      lastName: 'Frankfurt'
    };
    it('should post a user to the database', function(){
      return chai.request(app).post('/users').send(testPost)
      .then(result =>{
        // console.log(result);
        return User
        .findOne({'username': testPost.username})
        .exec();
      })
      .then(result =>{
        console.log(result);
        result.firstName.should.equal(testPost.firstName);
      });
    });
  });
  describe('authentication should reject bad inputs', function(){
    
    it('should not allow access to bad password', function(){
      let testPostId ='';
      BlogPost
      .findOne()
      .exec()
      .then(result =>{
        testPostId = result.id;
        console.log(testPostId);
        return chai.request(app)
      .put(`/posts/${testPostId}`)
      .auth('herp', 'derp')
      .send({
        username: 'frank',
        password: 'franklin',
        firstName: 'Francis',
        lastName: 'Frankfurt'
      });
      })
    .then(result => {
      result.should.not.exist();
      result.should.have.status(500);
    });
    });
    
    
    
        //       return chai.request(app)
        //     .put(`/posts/${post.id}`)
        //     .send(updateData)
        //     .auth(testUser.username, testUser.password);
        // })
  });
});
