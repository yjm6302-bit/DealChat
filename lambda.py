import json
import boto3
import os
import base64
import uuid
from datetime import datetime
from boto3.dynamodb.conditions import Attr, Key

# 리소스 초기화
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# 테이블 매핑
TABLES = {
    'files': dynamodb.Table('dealchat_files'),
    'companies': dynamodb.Table('dealchat_companies'),
    'sellers': dynamodb.Table('dealchat_sellers'),
    'buyers': dynamodb.Table('dealchat_buyers'),
    'users': dynamodb.Table('dealchat_users')
}

def lambda_handler(event, context):
    bucket_name = os.environ.get('BUCKET_NAME')
    
    try:
        # API Gateway vs Lambda Direct Test 구분
        if 'body' in event:
            body_raw = event['body']
            if event.get('isBase64Encoded', False):
                body_raw = base64.b64decode(body_raw).decode('utf-8')
            body = json.loads(body_raw)
        else:
            body = event

        action = body.get('action')
        table_key = body.get('table')
        
        if not table_key or table_key not in TABLES:
            return {"statusCode": 400, "body": json.dumps({"message": "유효한 table 파라미터가 필요합니다."})}
        if not action:
            return {"statusCode": 400, "body": json.dumps({"message": "action 파라미터가 필요합니다."})}

        match table_key:
            case 'files':
                return handle_files_table(action, body, bucket_name)
            case 'companies':
                return handle_companies_table(action, body)
            case 'sellers':
                return handle_sellers_table(action, body)
            case 'buyers':
                return handle_buyers_table(action, body)
            case 'users':
                return handle_users_table(action, body)
                
    except Exception as e:
        print(f"Error: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": "Internal Server Error", "details": str(e)})}

# --- 통합 조회 함수 ---
def perform_get_query(table_key, body):
    table = TABLES[table_key]
    
    # 테이블별 ID 필드 및 검색 필드 매핑
    mapping = {
        'files': {'id': 'fileId', 'label': 'file', 'search': ['file_name', 'summary']},
        'companies': {'id': 'companyId', 'label': 'company', 'search': ['companyName', 'summary']},
        'sellers': {'id': 'sellerId', 'label': 'seller', 'search': ['companyName', 'summary', 'industry']},
        'buyers': {'id': 'buyerId', 'label': 'buyer', 'search': ['companyName', 'interest_summary', 'summary']}
    }
    
    conf = mapping.get(table_key)
    # JS에서 id 또는 sellerId/fileId 등 혼용해서 보내는 것에 대응
    target_id = body.get('id') or body.get(conf['id'])
    user_id = body.get('userId')
    keyword = body.get('keyword')
    scan_mode = body.get('scanMode', False)

    # 1. 단일 아이템 조회
    if target_id:
        res = table.get_item(Key={'id': target_id})
        return {"statusCode": 200, "body": json.dumps(res.get('Item', {}))}

    # 2. 전체 스캔 (관리자용 등)
    if scan_mode:
        res = table.scan()
        return {"statusCode": 200, "body": json.dumps(res.get('Items', []))}

    # 3. 사용자별 목록 조회
    if user_id:
        try:
            query_params = {
                'IndexName': 'userId-index',
                'KeyConditionExpression': Key('userId').eq(user_id)
            }
            if keyword:
                filter_expr = None
                for field in conf['search']:
                    if filter_expr is None:
                        filter_expr = Attr(field).contains(keyword)
                    else:
                        filter_expr |= Attr(field).contains(keyword)
                query_params['FilterExpression'] = filter_expr
            
            res = table.query(**query_params)
        except:
            filter_expr = Attr('userId').eq(user_id)
            if keyword:
                keyword_filter = None
                for field in conf['search']:
                    if keyword_filter is None:
                        keyword_filter = Attr(field).contains(keyword)
                    else:
                        keyword_filter |= Attr(field).contains(keyword)
                filter_expr &= keyword_filter
            res = table.scan(FilterExpression=filter_expr)
            
        return {"statusCode": 200, "body": json.dumps(res.get('Items', []))}

    return {"statusCode": 400, "body": json.dumps({"message": "ID 또는 userId가 필요합니다."})}

# --- Table Handlers ---

def handle_files_table(action, body, bucket_name):
    table = TABLES['files']
    now = datetime.now().isoformat()

    match action:
        case 'upload':
            user_id = body.get('userId')
            if not user_id: return {"statusCode": 400, "body": json.dumps({"message": "userId 필요"})}
            
            file_name = body.get('file_name', 'unnamed')
            # 기존 ID가 있으면 유지 (수정 시), 없으면 생성
            file_uuid = body.get('id') or str(uuid.uuid4())
            s3_key = f"files/{user_id}/{file_uuid}_{file_name}"
            
            file_content = body.get('content', '')
            if file_content:
                file_data = base64.b64decode(file_content) if body.get('is_base64') else file_content.encode('utf-8')
                s3.put_object(Bucket=bucket_name, Key=s3_key, Body=file_data, ContentType=body.get('content_type', 'application/octet-stream'))
            
            item = {
                'id': file_uuid,
                'file_name': file_name,
                'location': s3_key,
                'userId': user_id,
                'summary': body.get('summary', ''),
                'tags': body.get('tags', []),
                'updatedAt': now,
                'createdAt': body.get('createdAt', now)
            }
            table.put_item(Item=item)
            
            # 회사 연동
            company_id = body.get('companyId')
            if company_id:
                TABLES['companies'].update_item(
                    Key={'id': company_id},
                    UpdateExpression="SET attachments = list_append(if_not_exists(attachments, :empty_list), :file_id), updatedAt = :now",
                    ExpressionAttributeValues={':file_id': [file_uuid], ':empty_list': [], ':now': now}
                )
            return {"statusCode": 200, "body": json.dumps({"message": "Success", "file_id": file_uuid})}

        case 'update':
            target_id = body.get('id')
            if not target_id: return {"statusCode": 400, "body": json.dumps({"message": "id 필요"})}
            
            update_expression = "SET summary = :s, tags = :t, file_name = :fn, updatedAt = :now"
            expression_values = {
                ':s': body.get('summary', ''),
                ':t': body.get('tags', []),
                ':fn': body.get('file_name', 'unnamed'),
                ':now': now
            }
            
            table.update_item(
                Key={'id': target_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_values
            )
            return {"statusCode": 200, "body": json.dumps({"message": "Updated successfully"})}

        case 'get':
            return perform_get_query('files', body)

        case 'delete':
            target_id = body.get('id') or body.get('fileId')
            file_item = table.get_item(Key={'id': target_id}).get('Item')
            if file_item:
                s3.delete_object(Bucket=bucket_name, Key=file_item['location'])
                table.delete_item(Key={'id': target_id})
                return {"statusCode": 200, "body": json.dumps({"message": "Deleted"})}
            return {"statusCode": 404, "body": json.dumps({"message": "Not Found"})}
        
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"Invalid action: {action}"})}

def handle_companies_table(action, body):
    table = TABLES['companies']
    now = datetime.now().isoformat()
    
    match action:
        case 'upload':
            company_id = body.get('id') or str(uuid.uuid4())
            item = {
                'id': company_id,
                'companyName': body.get('companyName', ''),
                'companyEnName': body.get('companyEnName', ''),
                'summary': body.get('summary', ''),
                'comments': body.get('comments', ''),
                'industry': body.get('industry', ''),
                'attachments': body.get('attachments', []),
                'userId': body.get('userId'),
                'createdAt': now,
                'updatedAt': now
            }
            table.put_item(Item=item)
            return {"statusCode": 200, "body": json.dumps({"companyId": company_id})}
        case 'get':
            return perform_get_query('companies', body)
        case 'delete':
            target_id = body.get('id') or body.get('companyId')
            table.delete_item(Key={'id': target_id})
            return {"statusCode": 200, "body": json.dumps({"message": "Deleted"})}
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"Invalid action: {action}"})}

def handle_sellers_table(action, body):
    table = TABLES['sellers']
    now = datetime.now().isoformat()
    match action:
        case 'upload':
            seller_id = body.get('id') or str(uuid.uuid4())
            item = {
                'id': seller_id,
                'companyId': body.get('companyId', ''),
                'companyName': body.get('companyName', ''),
                'industry': body.get('industry', ''),
                'summary': body.get('summary', ''),
                'sale_method': body.get('sale_method', ''),
                'sale_price': body.get('sale_price', ''),
                'userId': body.get('userId'),
                'createdAt': now,
                'updatedAt': now
            }
            table.put_item(Item=item)
            return {"statusCode": 200, "body": json.dumps({"seller_id": seller_id})}
        case 'get':
            return perform_get_query('sellers', body)
        case 'delete':
            target_id = body.get('id') or body.get('sellerId')
            table.delete_item(Key={'id': target_id})
            return {"statusCode": 200, "body": json.dumps({"message": "Deleted"})}
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"Invalid action: {action}"})}

def handle_buyers_table(action, body):
    table = TABLES['buyers']
    now = datetime.now().isoformat()
    match action:
        case 'upload':
            buyer_id = body.get('id') or str(uuid.uuid4())
            item = {
                'id': buyer_id,
                'companyName': body.get('companyName', ''),
                'interest_industry': body.get('interest_industry', ''),
                'interest_summary': body.get('interest_summary', ''),
                'userId': body.get('userId'),
                'createdAt': now,
                'updatedAt': now
            }
            table.put_item(Item=item)
            return {"statusCode": 200, "body": json.dumps({"buyer_id": buyer_id})}
        case 'get':
            return perform_get_query('buyers', body)
        case 'delete':
            target_id = body.get('id') or body.get('buyerId')
            table.delete_item(Key={'id': target_id})
            return {"statusCode": 200, "body": json.dumps({"message": "Deleted"})}
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"Invalid action: {action}"})}

def handle_users_table(action, body):
    table = TABLES['users']
    now = datetime.now().isoformat()
    match action:
        case 'create':
            item = {
                'id': body.get('id') or str(uuid.uuid4()),
                'email': body.get('email'),
                'password': body.get('password'),
                'name': body.get('name'),
                'company': body.get('company', ''),
                'createdAt': now,
                'updatedAt': now
            }
            table.put_item(Item=item)
            return {"statusCode": 200, "body": json.dumps({"message": "User created", "id": item['id']})}
        case 'read':
            # 이메일로 사용자 조회
            email = body.get('email')
            if not email: return {"statusCode": 400, "body": json.dumps({"message": "email 필요"})}
            
            res = table.scan(FilterExpression=Attr('email').eq(email))
            return {"statusCode": 200, "body": json.dumps(res.get('Items', []))}
        case _:
            return {"statusCode": 400, "body": json.dumps({"message": f"Invalid action: {action}"})}