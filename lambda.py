import json
import boto3
import os
import base64
import uuid
from datetime import datetime
from boto3.dynamodb.conditions import Attr, Key

# 리소스 초기화 (Region 명시 권장)
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# 테이블 매핑
TABLES = {
    'files': dynamodb.Table('dealchat_files'),
    'companies': dynamodb.Table('dealchat_companies'),
    'sellers': dynamodb.Table('dealchat_sellers'),
    'buyers': dynamodb.Table('dealchat_buyers')
}

def lambda_handler(event, context):
    bucket_name = os.environ.get('BUCKET_NAME')
    
    try:
        if 'body' in event:
            body_raw = event['body']
            if event.get('isBase64Encoded', False):
                body_raw = base64.b64decode(body_raw).decode('utf-8')
            body = json.loads(body_raw)
        else:
            # Lambda 직접 테스트 시 event 자체가 body일 수 있음
            body = event
        action = body.get('action')
        table_key = body.get('table') # 'files', 'companies' 등
        
        if not table_key or table_key not in TABLES:
            return {"statusCode": 400, "body": json.dumps({"message": "유효한 table 파라미터가 필요합니다."})}
        
        if not action:
            return {"statusCode": 400, "body": json.dumps({"message": "action 파라미터가 필요합니다."})}

        # 테이블별 핸들러 호출
        match table_key:
            case 'files':
                return handle_files_table(action, body, bucket_name)
            case 'companies':
                return handle_companies_table(action, body)
            case 'sellers':
                return handle_sellers_table(action, body)
            case 'buyers':
                return handle_buyers_table(action, body)
                
    except Exception as e:
        print(f"Error: {str(e)}") # CloudWatch 로그용
        return {"statusCode": 500, "body": json.dumps({"error": "Internal Server Error", "details": str(e)})}

# --- Table Handlers ---

def handle_files_table(action, body, bucket_name):
    table = TABLES['files']
    now = datetime.now().isoformat()

    match action:
        case 'upload':
            user_id = body.get('userId')
            if not user_id:
                return {"statusCode": 400, "body": json.dumps({"message": "userId가 필요합니다."})}
            
            file_name = body.get('file_name', 'unnamed')
            file_content = body.get('content', '')
            
            # 1. S3 Key 고유화 (UUID 추가로 덮어쓰기 방지)
            file_uuid = str(uuid.uuid4())
            s3_key = f"files/{user_id}/{file_uuid}_{file_name}"
            
            file_data = base64.b64decode(file_content) if body.get('is_base64') else file_content.encode('utf-8')
            s3.put_object(
                Bucket=bucket_name, 
                Key=s3_key, 
                Body=file_data, 
                ContentType=body.get('content_type', 'application/octet-stream')
            )
            
            # 2. DB 기록
            new_file_id = file_uuid
            item = {
                'id': new_file_id,
                'file_name': file_name,
                'location': s3_key,
                'userId': user_id,
                'summary': body.get('summary', ''),
                'tags': body.get('tags', []),
                'updatedAt': now,
                'createdAt': now
            }
            table.put_item(Item=item)
            
            # 3. 회사 연동 (Optional)
            company_id = body.get('companyId')
            if company_id:
                TABLES['companies'].update_item(
                    Key={'id': company_id},
                    UpdateExpression="SET attachments = list_append(if_not_exists(attachments, :empty_list), :file_id), updatedAt = :now",
                    ExpressionAttributeValues={':file_id': [new_file_id], ':empty_list': [], ':now': now}
                )
            
            return {"statusCode": 200, "body": json.dumps({"message": "Upload Success", "file_id": new_file_id})}

        case 'get':
            return perform_get_query(table, body, "file")

        case 'delete':
            target_id = body.get('fileId')
            file_item = table.get_item(Key={'id': target_id}).get('Item')
            if file_item:
                # S3 삭제 후 DB 삭제
                s3.delete_object(Bucket=bucket_name, Key=file_item['location'])
                table.delete_item(Key={'id': target_id})
                return {"statusCode": 200, "body": json.dumps({"message": "Deleted successfully"})}
            return {"statusCode": 404, "body": json.dumps({"message": "파일을 찾을 수 없습니다."})}

def handle_companies_table(action, body):
    table = TABLES['companies']
    now = datetime.now().isoformat()
    
    match action:
        case 'upload':
            company_id = str(uuid.uuid4())
            item = {
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
            # 필요한 필드들 자동 병합
            item.update({k: body.get(k, '') for k in ['summary', 'industry', 'comments', 'companyEnName']})
            table.put_item(Item=item)
            return {"statusCode": 200, "body": json.dumps({"companyId": company_id})}
            
        case 'get':
            return perform_get_query(table, body, "company")
            
        case 'delete':
            table.delete_item(Key={'id': body.get('companyId')})
            return {"statusCode": 200, "body": json.dumps({"message": "Deleted"})}


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

def perform_get_query(table, body, item_label):
    """
    중복되는 조회 로직을 통합. 
    userId 조회 시 Scan 대신 Query(GSI)를 사용하도록 유도.
    """
    item_id = body.get(f'{item_label}Id')
    user_id = body.get('userId')
    keyword = body.get('keyword')

    # 1. 단일 아이템 조회 (Primary Key)
    if item_id:
        res = table.get_item(Key={'id': item_id})
        return {"statusCode": 200, "body": json.dumps({item_label: res.get('Item')})}

    # 2. 사용자별 목록 조회
    if user_id:
        # GSI가 'userId-index'로 생성되어 있다고 가정 (성능 최적화)
        try:
            # 키워드가 있다면 FilterExpression 추가
            query_params = {
                'IndexName': 'userId-index',
                'KeyConditionExpression': Key('userId').eq(user_id)
            }
            if keyword:
                # 테이블별 검색 필드 설정 (유연하게 대처 가능)
                query_params['FilterExpression'] = Attr('companyName').contains(keyword) | Attr('summary').contains(keyword)
            
            res = table.query(**query_params)
            return {"statusCode": 200, "body": json.dumps({f"{item_label}s": res.get('Items', [])})}
        except:
            # GSI가 없을 경우를 대비한 Fallback (Scan) - 가급적 GSI 생성을 권장
            res = table.scan(FilterExpression=Attr('userId').eq(user_id))
            return {"statusCode": 200, "body": json.dumps({f"{item_label}s": res.get('Items', [])})}

    return {"statusCode": 400, "body": json.dumps({"message": "ID 또는 userId가 필요합니다."})}