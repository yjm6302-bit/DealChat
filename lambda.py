import json
import boto3
import os
import base64
import uuid
from datetime import datetime

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Initialize all tables
file_table = dynamodb.Table('dealchat_files')
company_table = dynamodb.Table('dealchat_companies')
seller_table = dynamodb.Table('dealchat_sellers')
buyer_table = dynamodb.Table('dealchat_buyers')

def lambda_handler(event, context):
    bucket_name = os.environ.get('BUCKET_NAME')
    
    try:
        body_raw = event.get('body', '{}')
        if event.get('isBase64Encoded', False):
            body_raw = base64.b64decode(body_raw).decode('utf-8')
        
        body = json.loads(body_raw)
        action = body.get('action')
        table_name = body.get('table')
        
        if not table_name:
            return {"statusCode": 400, "body": json.dumps({"message": "table 파라미터가 필요합니다."})}
        
        if not action:
            return {"statusCode": 400, "body": json.dumps({"message": "action 파라미터가 필요합니다."})}
        
        # Match table and handle actions
        match table_name:
            case 'files':
                return handle_files_table(action, body, bucket_name)
            
            case 'companies':
                return handle_companies_table(action, body)
            
            case 'sellers':
                return handle_sellers_table(action, body)
            
            case 'buyers':
                return handle_buyers_table(action, body)
            
            case _:
                return {"statusCode": 400, "body": json.dumps({"message": f"지원하지 않는 테이블입니다: {table_name}"})}
    
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def handle_files_table(action, body, bucket_name):
    """Handle dealchat_files table operations"""
    match action:
        case 'upload':
            user_id = body.get('userId')
            if not user_id:
                return {"statusCode": 400, "body": json.dumps({"message": "userId가 필요합니다."})}
            
            file_name = body.get('file_name', 'unnamed')
            file_content = body.get('content', '')
            company_id = body.get('companyId')
            
            # Upload to S3
            s3_key = f"files/{user_id}/{file_name}"
            file_data = base64.b64decode(file_content) if body.get('is_base64') else file_content.encode('utf-8')
            s3.put_object(Bucket=bucket_name, Key=s3_key, Body=file_data, ContentType=body.get('content_type', 'image/png'))
            
            # Create DB entry
            new_file_id = str(uuid.uuid4())
            file_table.put_item(
                Item={
                    'id': new_file_id,
                    'file_name': file_name,
                    'location': s3_key,
                    'userId': user_id,
                    'updatedAt': datetime.now().isoformat(),
                    'createdAt': datetime.now().isoformat()
                }
            )
            
            # Link to company if companyId provided
            if company_id:
                response = company_table.get_item(Key={'id': company_id})
                if 'Item' in response:
                    attachments = response['Item'].get('attachments', [])
                    if new_file_id not in attachments:
                        company_table.update_item(
                            Key={'id': company_id},
                            UpdateExpression="SET attachments = list_append(if_not_exists(attachments, :empty_list), :file_id)",
                            ExpressionAttributeValues={':file_id': [new_file_id], ':empty_list': []}
                        )
            
            return {"statusCode": 200, "body": json.dumps({"message": "Upload Success", "file_id": new_file_id})}
        
        case 'delete':
            target_id = body.get('fileId')
            company_id = body.get('companyId')
            
            if not target_id:
                return {"statusCode": 400, "body": json.dumps({"message": "삭제할 파일 id가 필요합니다."})}
            
            # If companyId provided, only remove reference from company
            if company_id:
                response = company_table.get_item(Key={'id': company_id})
                if 'Item' in response:
                    attachments = response['Item'].get('attachments', [])
                    if target_id in attachments:
                        new_attachments = [a for a in attachments if a != target_id]
                        company_table.update_item(
                            Key={'id': company_id},
                            UpdateExpression="SET attachments = :val",
                            ExpressionAttributeValues={':val': new_attachments}
                        )
                return {"statusCode": 200, "body": json.dumps({"message": "Company reference removed"})}
            
            # Otherwise, delete from S3 and DB
            else:
                file_item = file_table.get_item(Key={'id': target_id}).get('Item')
                if file_item:
                    actual_s3_key = file_item.get('location')
                    if actual_s3_key:
                        s3.delete_object(Bucket=bucket_name, Key=actual_s3_key)
                    file_table.delete_item(Key={'id': target_id})
                
                return {"statusCode": 200, "body": json.dumps({"message": "Full deletion (S3 & DB) completed"})}
        
        case 'get':
            file_id = body.get('fileId')
            user_id = body.get('userId')
            keyword = body.get('keyword')
            scan_mode = body.get('scanMode', False)
            
            if file_id:
                # Get specific file
                response = file_table.get_item(Key={'id': file_id})
                if 'Item' in response:
                    return {"statusCode": 200, "body": json.dumps({"file": response['Item']})}
                else:
                    return {"statusCode": 404, "body": json.dumps({"message": "파일을 찾을 수 없습니다."})}
            elif user_id:
                # Get all files for user (scan with filter)
                if keyword:
                    # Filter by userId and keyword in file_name, summary, or tags
                    from boto3.dynamodb.conditions import Attr
                    response = file_table.scan(
                        FilterExpression=Attr('userId').eq(user_id) & (
                            Attr('file_name').contains(keyword) | 
                            Attr('summary').contains(keyword) | 
                            Attr('tags').contains(keyword)
                        )
                    )
                else:
                    # Get all files for user without keyword filter
                    response = file_table.scan(
                        FilterExpression='userId = :uid',
                        ExpressionAttributeValues={':uid': user_id}
                    )
                return {"statusCode": 200, "body": json.dumps({"files": response.get('Items', [])})}
            elif scan_mode:
                # Get all files for user (scan without filter)
                response = file_table.scan()
                return {"statusCode": 200, "body": json.dumps({"files": response.get('Items', [])})}
            else:
               return {"statusCode": 400, "body": json.dumps({"message": "fileId 또는 userId가 필요합니다."})}
        
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"지원하지 않는 action입니다: {action}"})}


def handle_companies_table(action, body):
    """Handle dealchat_companies table operations"""
    match action:
        case 'upload':
            company_id = str(uuid.uuid4())
            company_data = {
                'id': company_id,
                'companyName': body.get('companyName', ''),
                'companyEnName': body.get('companyEnName', ''),
                'summary': body.get('summary', ''),
                'comments': body.get('comments', ''),
                'industry': body.get('industry', ''),
                'attachments': body.get('attachments', []),
                'userId': body.get('userId'),
                'createdAt': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat()
            }
            company_table.put_item(Item=company_data)
            return {"statusCode": 200, "body": json.dumps({"message": "Company created", "companyId": company_id})}
        
        case 'get':
            company_id = body.get('companyId')
            user_id = body.get('userId')
            keyword = body.get('keyword')
            scan_mode = body.get('scanMode', False)
            
            if company_id:
                response = company_table.get_item(Key={'id': company_id})
                if 'Item' in response:
                    return {"statusCode": 200, "body": json.dumps({"company": response['Item']})}
                else:
                    return {"statusCode": 404, "body": json.dumps({"message": "회사를 찾을 수 없습니다."})}
            elif user_id:
                if keyword:
                    response = company_table.scan(
                        FilterExpression=Attr('userId').eq(user_id) & (
                        Attr('companyName').contains(keyword) | 
                        Attr('summary').contains(keyword) | 
                        Attr('industry').contains(keyword)
                        )
                    )
                else:
                    response = company_table.scan(
                        FilterExpression='userId = :uid',
                        ExpressionAttributeValues={':uid': user_id}
                    )
                return {"statusCode": 200, "body": json.dumps({"companies": response.get('Items', [])})}
            elif scan_mode:
                response = company_table.scan()
                return {"statusCode": 200, "body": json.dumps({"companies": response.get('Items', [])})}
            else:
                return {"statusCode": 400, "body": json.dumps({"message": "companyId 또는 userId가 필요합니다."})}
        
        case 'delete':
            company_id = body.get('companyId')
            if not company_id:
                return {"statusCode": 400, "body": json.dumps({"message": "companyId가 필요합니다."})}
            
            company_table.delete_item(Key={'id': company_id})
            return {"statusCode": 200, "body": json.dumps({"message": "Company deleted"})}
        
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"지원하지 않는 action입니다: {action}"})}


def handle_sellers_table(action, body):
    """Handle dealchat_sellers table operations"""
    match action:
        case 'upload':
            seller_id = str(uuid.uuid4())
            seller_data = {
                'id': seller_id,
                'companyId': body.get('companyId', ''),
                'companyName': body.get('companyName', ''),
                'industry': body.get('industry', ''),
                'summary': body.get('summary', ''),
                'others': body.get('others', ''),
                'sale_method': body.get('sale_method', ''),
                'sale_price': body.get('sale_price', ''),
                'sale_files': [],
                'sale_type': body.get('sale_type', ''),
                'sale_with': [],
                'userId': body.get('userId'),
                'createdAt': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat()
            }
            seller_table.put_item(Item=seller_data)
            return {"statusCode": 200, "body": json.dumps({"message": "Seller created", "seller_id": seller_id})}
        
        case 'get':
            seller_id = body.get('sellerId')
            user_id = body.get('userId')
            keyword = body.get('keyword')
            scan_mode = body.get('scanMode', False)
            
            if seller_id:
                response = seller_table.get_item(Key={'id': seller_id})
                if 'Item' in response:
                    return {"statusCode": 200, "body": json.dumps({"seller": response['Item']})}
                else:
                    return {"statusCode": 404, "body": json.dumps({"message": "판매자를 찾을 수 없습니다."})}
            elif user_id:
                if keyword:
                    response = seller_table.scan(
                        FilterExpression=Attr('userId').eq(user_id) & (
                            Attr('companyName').contains(keyword) | 
                            Attr('summary').contains(keyword) | 
                            Attr('industry').contains(keyword)
                        )
                    )
                else:
                    response = seller_table.scan(
                        FilterExpression='userId = :uid',
                        ExpressionAttributeValues={':uid': user_id}
                    )
                return {"statusCode": 200, "body": json.dumps({"sellers": response.get('Items', [])})}
            elif scan_mode:
                response = seller_table.scan()
                return {"statusCode": 200, "body": json.dumps({"sellers": response.get('Items', [])})}
            else:
                return {"statusCode": 400, "body": json.dumps({"message": "sellerId 또는 userId가 필요합니다."})}
        
        case 'delete':
            seller_id = body.get('sellerId')
            if not seller_id:
                return {"statusCode": 400, "body": json.dumps({"message": "sellerId가 필요합니다."})}
            
            seller_table.delete_item(Key={'id': seller_id})
            return {"statusCode": 200, "body": json.dumps({"message": "Seller deleted"})}
        
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"지원하지 않는 action입니다: {action}"})}


def handle_buyers_table(action, body):
    """Handle dealchat_buyers table operations"""
    match action:
        case 'upload':
            buyer_id = str(uuid.uuid4())
            buyer_data = {
                'id': buyer_id,
                'companyName': body.get('companyName', ''),
                'interest_industry': body.get('interest_industry', ''),
                'interest_summary': body.get('interest_summary', ''),
                'others': body.get('others', ''),
                'investment_amount': body.get('investment_amount', ''),
                'summary': body.get('summary', ''),
                'userId': body.get('userId'),
                'createdAt': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat()
            }
            buyer_table.put_item(Item=buyer_data)
            return {"statusCode": 200, "body": json.dumps({"message": "Buyer created", "buyer_id": buyer_id})}
        
        case 'get':
            buyer_id = body.get('buyerId')
            user_id = body.get('userId')
            keyword = body.get('keyword')
            scan_mode = body.get('scanMode', False)
            
            if buyer_id:
                response = buyer_table.get_item(Key={'id': buyer_id})
                if 'Item' in response:
                    return {"statusCode": 200, "body": json.dumps({"buyer": response['Item']})}
                else:
                    return {"statusCode": 404, "body": json.dumps({"message": "구매자를 찾을 수 없습니다."})}
            elif user_id:
                if keyword:
                    response = buyer_table.scan(
                        FilterExpression=Attr('userId').eq(user_id) & (
                            Attr('companyName').contains(keyword) | 
                            Attr('interest_industry').contains(keyword) | 
                            Attr('interest_summary').contains(keyword) | 
                            Attr('summary').contains(keyword)
                        )
                    )
                else:
                    response = buyer_table.scan(
                        FilterExpression='userId = :uid',
                        ExpressionAttributeValues={':uid': user_id}
                    )
                return {"statusCode": 200, "body": json.dumps({"buyers": response.get('Items', [])})}
            elif scan_mode:
                response = buyer_table.scan()
                return {"statusCode": 200, "body": json.dumps({"buyers": response.get('Items', [])})}
            else:
                return {"statusCode": 400, "body": json.dumps({"message": "buyerId 또는 userId가 필요합니다."})}
        
        case 'delete':
            buyer_id = body.get('buyerId')
            if not buyer_id:
                return {"statusCode": 400, "body": json.dumps({"message": "buyerId가 필요합니다."})}
            
            buyer_table.delete_item(Key={'id': buyer_id})
            return {"statusCode": 200, "body": json.dumps({"message": "Buyer deleted"})}
        
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"지원하지 않는 action입니다: {action}"})}