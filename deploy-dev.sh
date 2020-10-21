#!/bin/bash
set -e

aws-vault exec default --no-session -- sam package --s3-bucket ifood-polling --template-file template.yml  --output-template-file output.yml
aws-vault exec default --no-session -- sam deploy --s3-bucket ifood-polling --stack-name polling-service --template-file output.yml  --capabilities CAPABILITY_IAM