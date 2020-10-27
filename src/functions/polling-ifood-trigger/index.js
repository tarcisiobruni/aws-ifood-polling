'use strict';

const NEW_EVENT_QUEUE_URL = process.env.NEW_EVENT_QUEUE_URL;
const DYNAMO_TABLE = process.env.DYNAMO_TABLE;
const IFOOD_POLLING_URL = 'https://pos-api.ifood.com.br/v3.0/events:polling';

var AWS = require("aws-sdk");
var AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

var sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
var docClient = new AWS.DynamoDB.DocumentClient();

const axios = require('axios');

/**
 * A Lambda function that catchs and sends ifood orders to queue
 * 
 * @param {Object} event - Input event to the Lambda function
 *
 *
 */
exports.handler = async (event) => {
    var message = event.Records[0];
    var smartpagToken = message.body;
    var smartpagData = await findIfoodToken(smartpagToken)
    if (smartpagData.length > 0) {
        var ifoodToken = smartpagData[0].ifood_token
        try {
            var responsePolling = await polling(ifoodToken);
            if (responsePolling.status == 200) {
                // olders first
                var newEvents = Array.from(responsePolling.data).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                
                // // splits as a batch list. Batch has limitation of 10 message.
                // var eventsGroup = []
                // while (newEvents.length > 0) {
                //     eventsGroup.push(newEvents.splice(0, newEvents.length < 10 ? newEvents.length : 10))
                // }

                console.info("Sending events to queue")
                // var result = await Promise.all(eventsGroup.map((events) => sqs.sendMessageBatch(createBatch(events, smartpagToken)).promise()));
                var batch = createBatch(newEvents, smartpagToken)
                var result = await sqs.sendMessageBatch(batch).promise();
                console.info(result);
                return result
            }
        } catch (error) {
            if (error.isAxiosError) {
                if (error.response.status == 404 || error.response.status == 401) {
                    console.warn("Without new orders")
                    return {};
                }
            }
            console.warn("Polling has errors", error)

            // throw exception, do not handle. Lambda will make message visible again.
            throw error
        }
    }
}

async function polling(ifoodToken) {
    var options = {
        url: IFOOD_POLLING_URL,
        method: 'GET',
        headers: { "Authorization": `Bearer ${ifoodToken}` }
    }
    var response = await axios(options);
    return response;
}

async function findIfoodToken(token) {
    var params = {
        TableName: DYNAMO_TABLE,
        KeyConditionExpression: 'smartpag_token = :token',
        ExpressionAttributeValues: { ':token': token },
    };

    var result = await docClient
        .query(params)
        .promise();

    return result.Items;
}


function createBatch(ifoodEvents, smartpagToken) {
    var messages = ifoodEvents.map(event => {
        return {
            Id: event.id, 
            DelaySeconds: 0,
            MessageBody: smartpagToken,
            MessageAttributes: {
                "code": {
                    DataType: "String",
                    StringValue: event.code
                },
                "correlationId": {
                    DataType: "String",
                    StringValue: event.correlationId
                },
                "createdAt": {
                    DataType: "String",
                    StringValue: event.createdAt
                },
                "id": {
                    DataType: "String",
                    StringValue: event.id
                }
            },
        };
    })
    var batch = {
        Entries: messages,
        QueueUrl: NEW_EVENT_QUEUE_URL
    }
    return batch
}
