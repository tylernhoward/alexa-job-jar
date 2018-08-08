const alexaSDK = require('alexa-sdk');
const awsSDK = require('aws-sdk');
const promisify = require('es6-promisify');

const appId = 'amzn1.ask.skill.eb6c9f1b-3c11-4c56-8594-3ce3034de864';
const jobsTable = 'Jobs';
const docClient = new awsSDK.DynamoDB.DocumentClient();

// convert callback style functions to promises
const dbScan = promisify(docClient.scan, docClient);
const dbGet = promisify(docClient.get, docClient);
const dbPut = promisify(docClient.put, docClient);
const dbDelete = promisify(docClient.delete, docClient);

const instructions = `Welcome to Job Jar<break strength="medium" /> 
                      The following commands are available: grab a job, 
                      add a job, delete a job, and list all jobs, What 
                      would you like to do?`;

const handlers = {

  /**
   * Triggered when the user says "Alexa, open Job Jar
   */
  'LaunchRequest' () {
    this.emit(':ask', instructions);
  },

  /**
   * Adds a job to the current user's saved jobs.
   * Slots: JobName
   */
  'AddJobIntent' () {
    const {
      userId
    } = this.event.session.user;
    const {
      slots
    } = this.event.request.intent;

    // prompt for slot values and request a confirmation for each

    // JobName
    if (!slots.JobName.value) {
      const slotToElicit = 'JobName';
      const speechOutput = 'What job would you like to add?';
      const repromptSpeech = 'Please tell me a job would you like to add.';
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    } else if (slots.JobName.confirmationStatus !== 'CONFIRMED') {

      if (slots.JobName.confirmationStatus !== 'DENIED') {
        // slot status: unconfirmed
        const slotToConfirm = 'JobName';
        const speechOutput = `The job you want to add is: ${slots.JobName.value}, correct?`;
        const repromptSpeech = speechOutput;
        return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
      }

      // slot status: denied -> reprompt for slot data
      const slotToElicit = 'JobName';
      const speechOutput = 'What job would you like to add?';
      const repromptSpeech = 'Please tell me a job would you like to add.';
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    }

    // all slot values received and confirmed, now add the record to DynamoDB

    const name = slots.JobName.value;
    const dynamoParams = {
      TableName: jobsTable,
      Item: {
        Name: name,
        UserId: userId,
      }
    };

    const checkIfJobExistsParams = {
      TableName: jobsTable,
      Key: {
        Name: name,
        UserId: userId
      }
    };

    console.log('Attempting to add job', dynamoParams);

    // query DynamoDB to see if the item exists first
    dbGet(checkIfJobExistsParams)
      .then(data => {
        console.log('Get item succeeded', data);

        const job = data.Item;

        if (job) {
          const errorMsg = `Job ${name} already exists!`;
          this.emit(':tell', errorMsg);
          throw new Error(errorMsg);
        } else {
          // no match, add the job
          return dbPut(dynamoParams);
        }
      })
      .then(data => {
        console.log('Add item succeeded', data);
        this.emit(':tell', `Job ${name} added!`);
      })
      .catch(err => {
        console.error(err);
      });
  },

  /**
   * Lists all saved jobs for the current user.
   */
  'GetAllJobsIntent' () {
    const {
      userId
    } = this.event.session.user;
    const {
      slots
    } = this.event.request.intent;
    let output;

    const dynamoParams = {
      TableName: jobsTable
    };

    dynamoParams.FilterExpression = 'UserId = :user_id';
    dynamoParams.ExpressionAttributeValues = {
      ':user_id': userId
    };
    output = 'The following jobs were found: <break strength="x-strong" />';


    // query DynamoDB
    dbScan(dynamoParams)
      .then(data => {
        console.log('Read table succeeded!', data);

        if (data.Items && data.Items.length) {
          data.Items.forEach(item => {
            output += `${item.Name}<break strength="x-strong" />`;
          });
        } else {
          output = 'No jobs found!';
        }

        console.log('output', output);

        this.emit(':tell', output);
      })
      .catch(err => {
        console.error(err);
      });
  },

  /**
   * Gets a random saved job for this user.
   */
  'GetJobIntent' () {
    const {
      slots
    } = this.event.request.intent;
    const {
      userId
    } = this.event.session.user;

    const dynamoParams = {
      TableName: jobsTable,
      FilterExpression: 'UserId = :user_id',
      ExpressionAttributeValues: {
        ':user_id': userId
      }
    };

    console.log('Attempting to read data');

    // query DynamoDB
    dbScan(dynamoParams)
      .then(data => {
        console.log('Read table succeeded!', data);

        const jobs = data.Items;

        if (!jobs.length) {
          this.emit(':tell', 'No jobs added.');
        } else {
          const randomNumber = Math.floor(Math.random() * jobs.length);
          const job = jobs[randomNumber];
          this.emit(':tell', `You grabbed ${job.Name} <break time="500ms"/>. Get to work!`);
          if (job) {
            console.log('Attempting to delete data', data);
            return dbDelete(dynamoParams);
          }
          const errorMsg = `Job ${JobName} not found!`;
          this.emit(':tell', errorMsg);
          throw new Error(errorMsg);
        }
      })
      .catch(err => console.error(err));
  },

  /**
   * Allow the user to delete one of their jobs.
   */
  'DeleteJobIntent' () {
    const {
      slots
    } = this.event.request.intent;

    // prompt for the job name if needed and then require a confirmation
    if (!slots.JobName.value) {
      const slotToElicit = 'JobName';
      const speechOutput = 'What is the name of the job you would like to delete?';
      const repromptSpeech = 'Please tell me the job you would like to delete';
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    } else if (slots.JobName.confirmationStatus !== 'CONFIRMED') {

      if (slots.JobName.confirmationStatus !== 'DENIED') {
        // slot status: unconfirmed
        const slotToConfirm = 'JobName';
        const speechOutput = `You would like to delete the job ${slots.JobName.value}, correct?`;
        const repromptSpeech = speechOutput;
        return this.emit(':confirmSlot', slotToConfirm, speechOutput, repromptSpeech);
      }

      // slot status: denied -> reprompt for slot data
      const slotToElicit = 'JobName';
      const speechOutput = 'What is the name of the job you would like to delete?';
      const repromptSpeech = 'Please tell me the job you would like to delete';
      return this.emit(':elicitSlot', slotToElicit, speechOutput, repromptSpeech);
    }

    const {
      userId
    } = this.event.session.user;
    const JobName = slots.JobName.value;
    const dynamoParams = {
      TableName: jobsTable,
      Key: {
        Name: JobName,
        UserId: userId
      }
    };

    console.log('Attempting to read data');

    // query DynamoDB to see if the item exists first
    dbGet(dynamoParams)
      .then(data => {
        console.log('Get item succeeded', data);

        const job = data.Item;

        if (job) {
          console.log('Attempting to delete data', data);
          return dbDelete(dynamoParams);
        }

        const errorMsg = `Job ${JobName} not found!`;
        this.emit(':tell', errorMsg);
        throw new Error(errorMsg);
      })
      .then(data => {
        console.log('Delete item succeeded', data);

        this.emit(':tell', `Job ${JobName} deleted!`);
      })
      .catch(err => console.log(err));
  },


  'Unhandled' () {
    console.error('problem', this.event);
    this.emit(':ask', 'An unhandled problem occurred!');
  },

  'AMAZON.HelpIntent' () {
    const speechOutput = instructions;
    const reprompt = instructions;
    this.emit(':ask', speechOutput, reprompt);
  },

  'AMAZON.CancelIntent' () {
    this.emit(':tell', 'Goodbye!');
  },

  'AMAZON.StopIntent' () {
    this.emit(':tell', 'Goodbye!');
  }
};

exports.handler = function handler(event, context) {
  const alexa = alexaSDK.handler(event, context);
  alexa.APP_ID = appId;
  alexa.registerHandlers(handlers);
  alexa.execute();
};