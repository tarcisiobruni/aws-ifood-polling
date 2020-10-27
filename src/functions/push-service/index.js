'use strict';

const FIREBASE_SERVER_KEY = process.env.FIREBASE_SERVER_KEY;
const DYNAMO_TABLE = process.env.DYNAMO_TABLE;
const HIGH = 'high'

var AWS = require("aws-sdk");
var AWS_REGION = 'us-east-1';
AWS.config.update({ region: AWS_REGION });

const docClient = new AWS.DynamoDB.DocumentClient();

const axios = require('axios');

/**
 * A Lambda function sends notification about ifood orders
 * 
 * @param {Object} event - Input event to the Lambda function
 * @param {Object} context - Input event to the Lambda function
 * @param {Object} callback - Input event to the Lambda function
 *
 *
 */exports.handler = async (event, context, callback) => { 
    try {
        var order = event.order
        var message = event.message
        var backendServer = event.backendServer
        var pushNotification = preparePushNotification(message);
        var pushData = preparePushData(order);
        var deviceIds = await getDevices(backendServer)
        var result = await sendPushNotication(pushNotification, pushData, deviceIds);
        callback(null, result);
    } catch (err) {
        callback(err);
    }
}

function mountTitleFromCode(code) {
    let title = ""
    switch (code) {
        case 'INTEGRATED':
            title = "Novo Pedido!"
            break;
        case 'CANCELLED':
            title = "Pedido Cancelado!"
            break;
        case 'RECOMMENDED_PREPARATION_START':
            title = "Inicie o preparo"
            break;
        case 'ASSIGN_DRIVER':
            title = "Motorista alocado para entrega!"
            break;
        case 'GOING_TO_ORIGIN':
            title = "Motorista está a caminho!"
            break;
        case 'ARRIVED_AT_ORIGIN':
            title = "Motorista chegou!"
            break;
        default:
            title = "Atualizações de pedido!"
            break;
    }
    return title;
}

function preparePushData(order) {
    var data = {
        'orderId': order.id
    }
    return data
}

function preparePushNotification(message) {
    var code = message.messageAttributes.code
    let title = mountTitleFromCode(code)
    var notification = {
        'title': title,
        'body': "Fique ligado :-)"
    };
    return notification
}

async function getDevices(backendServer) {
    // capture from dynamo
    var smartpagData = await findIfoodToken(backendServer)
    var devicesIds = Array.from(smartpagData).map(data => {return data.deviceId})
    return devicesIds
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

async function sendPushNotication(pushNotification, pushData, deviceIds) {
    var options = {
        method: 'POST',
        headers: {
            'Authorization': 'Key=' + FIREBASE_SERVER_KEY,
            'Content-Type': 'application/json'
        }
    };

    var requestBody = {
        'registration_ids': deviceIds,
        'notification': pushNotification,
        'data': pushData,
        'priority': HIGH
    }

    let resultado  = await axios.post('https://fcm.googleapis.com/fcm/send', requestBody, options)
        .then(res => {
            var result = JSON.stringify(res.data.results);
            var response = { "code": "success", "data": res.data, "results": result };
            if (res.data.success == 0 || res.data.failure >= 1) {
                console.log("falha na entrega da mensagem" + result);
                throw new Error(result);
            }
            console.log( result);	   
	        return response;
        })
        .catch(error => {
            console.error(error);
            throw new Error(error);
        })
        return resultado; 


}

