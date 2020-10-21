'use strict';

const SMARTPAG_ENDPOINT = process.env.SMARTPAG_ENDPOINT;
const PUSH_LAMBDA = process.env.PUSH_LAMBDA;
const DYNAMO_TABLE = process.env.DYNAMO_TABLE;
const IFOOD_ACK_URL = 'https://pos-api.ifood.com.br/v1.0/events/acknowledgment';

var AWS = require("aws-sdk");
var AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

var lambda = new AWS.Lambda({ region: AWS_REGION });
var docClient = new AWS.DynamoDB.DocumentClient();

const axios = require('axios');
const fakeOrder = {
    "id": "560b457d-e5fb-4383-b5ae-00213700f457",
    "reference": "7083322104518077",
    "shortReference": "1886",
    "scheduled": false,
    "isTest": true,
    "preparationTimeInSeconds": 0,
    "takeOutTimeInSeconds": 0,
    "createdAt": "2020-10-14T16:41:33.989376Z",
    "preparationStartDateTime": "2020-10-14T16:41:33.989376Z",
    "deliveryDateTime": "2020-10-14T17:31:33.989376Z",
    "customer": {
        "id": "2672867",
        "uuid": "d602f643-f772-4282-bbe6-08b505d7c916",
        "name": "PEDIDO DE TESTE - Tarcísio Bruni Rangel",
        "phone": "0800 007 0110 ID: 35183004",
        "ordersCountOnRestaurant": 0
    },
    "deliveryAddress": {
        "formattedAddress": "PEDIDO DE TESTE - NÃO ENTREGAR - Ramal Bujari, 100",
        "country": "BR",
        "state": "AC",
        "city": "Bujari",
        "coordinates": {
            "latitude": -9.822159,
            "longitude": -67.948475
        },
        "neighborhood": "Bujari",
        "streetName": "PEDIDO DE TESTE - NÃO ENTREGAR - Ramal Bujari",
        "streetNumber": "100",
        "postalCode": "69923000"
    },
    "payments": [
        {
            "name": "CRÉDITO - MASTERCARD (MÁQUINA)",
            "code": "RDREST",
            "value": 23.50,
            "prepaid": false
        }
    ],
    "deliveryMethod": {
        "id": "DEFAULT",
        "value": 10,
        "minTime": 50,
        "maxTime": 60,
        "mode": "DELIVERY",
        "deliveredBy": "MERCHANT"
    },
    "merchant": {
        "id": "905c384d-fdbb-40af-acee-252aa2d6bf43",
        "shortId": "1222602",
        "name": "Teste Smartpag",
        "address": {
            "formattedAddress": "RAMAL BUJARI",
            "country": "BR",
            "state": "AC",
            "city": "BUJARI",
            "neighborhood": "Bujari",
            "streetName": "RAMAL BUJARI",
            "streetNumber": "100",
            "postalCode": "69923000"
        }
    },
    "localizer": {
        "id": "35183004"
    },
    "items": [
        {
            "id": "fa81c6f7-7b0b-4baf-94d9-8b4c56cf4c7a",
            "name": "PEDIDO DE TESTE - Açaí",
            "quantity": 1,
            "price": 0.00,
            "subItemsPrice": 13.50,
            "totalPrice": 13.50,
            "discount": 0.0,
            "addition": 0.0,
            "externalId": "378950278",
            "subItems": [
                {
                    "id": "112dba54-3189-47f5-8422-7de8b9916c95",
                    "name": "300 ml",
                    "quantity": 1,
                    "price": 13.50,
                    "totalPrice": 13.50,
                    "discount": 0.0,
                    "addition": 0.00
                }
            ],
            "index": 1
        }
    ],
    "subTotal": 13.50,
    "totalPrice": 23.50,
    "deliveryFee": 10.00
}

/**
 * A Lambda function that catchs and sends orders to smartpag server
 * 
 * @param {Object} event - Input event to the Lambda function
 *
 *
 */
exports.handler = async (event) => {
    var message = event.Records[0];
    var backendServer = message.body;
    var smartpagData = await findIfoodToken(backendServer) 
    if (smartpagData.Items.length > 0) {
        var ifoodToken = smartpagData.Items[0].ifood_token
        try {
            // var orderResponse = await sendToSmartServer(backendServer, message)
            await ackEvent(message, ifoodToken)
            var code = message.messageAttributes.code
            if (['INTEGRATED', 'GOING_TO_ORIGIN', 'ARRIVED_AT_ORIGIN', 'CANCELLED', 'ASSIGN_DRIVER', 'RECOMMENDED_PREPARATION_START'].some(state => state === code)) {
                // return pushFunctionLambda(message, orderResponse.body, backendServer);
                return pushFunctionLambda(message, fakeOrder, backendServer);
            }
            return;
        } catch (error) {
            console.warn(error)
            // throw exception, do not handle. Lambda will make message visible again.
            throw error
        }
    }
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

async function ackEvent(message, ifoodToken) {
    var options = {
        url: IFOOD_ACK_URL,
        method: 'POST',
        headers: { "Authorization": `Bearer ${ifoodToken}` },
        data: [
            { id: message.messageAttributes.id }
        ]
    }
    var response = await axios(options);
    return response;
}

async function sendToSmartServer(backendServer, message) {
    var options = {
        url: `${SMARTPAG_ENDPOINT}`,
        method: 'PUT',
        headers: { "Authorization": `Bearer ${backendServer}` },
        data: message.messageAttributes
    }
    var response = await axios(options);
    return response;
}

function pushFunctionLambda(message, order, backendServer) {
    var payload = {
        message,
        order,
        backendServer
    }
    var params = {
        FunctionName: PUSH_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify(payload)
    };
    return lambda.invoke(params, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else console.log(data);           // successful response
    });
}
