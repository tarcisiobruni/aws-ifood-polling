'use strict';

const PING_QUEUE_URL = process.env.PING_QUEUE_URL

var AWS = require("aws-sdk");
var AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

var sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const uuid = require('uuid');


/**
 * A Lambda function that enqueue pings
 * 
 * @param {Object} event - Input event to the Lambda function
 *
 *
 */
exports.handler = async (event) => {
    try {
        var body = JSON.parse(event.body)
        if (body) {
            var backendServer = body.token
            // TODO: Validate backendServer
            console.info(backendServer)

            var batch = createBatch(backendServer, 4)
            console.info(batch)
            var result = await sqs.sendMessageBatch(batch).promise()

            console.info(result)
            console.info("Ping sent to queue")

            return {
                "statusCode": result.Successful ? 200 : 500,
                "body": result.Successful ? "pong" : "error"
            }
        } else {
            console.warn("Wrong body")
            return {
                "statusCode": 400,
                "body": "something wrong"
            }
        }
    } catch (error) {
        throw error
    }
}

function createBatch(backendServer, time) {
    var delays = []
    var secondInterval = 60 / time;
    for (let index = 0; index < time; index++) delays.push(index * secondInterval)

    var messages = delays.map(delay => {
        return {
            'Id': uuid.v4(),
            'DelaySeconds': delay,
            'MessageBody': backendServer
        };
    })

    var batch = {
        Entries: messages,
        QueueUrl: PING_QUEUE_URL
    }
    
    return batch
}
