from storages.backends.s3boto3 import S3Boto3Storage
import os

class PublicMediaStorage(S3Boto3Storage):
    default_acl    = 'public-read'
    file_overwrite = False
    region_name    = os.environ.get('AWS_S3_REGION_NAME', 'eu-west-1')
    custom_domain  = f"{os.environ.get('AWS_STORAGE_BUCKET_NAME', 'tutorjamesconnect-media')}.s3.{os.environ.get('AWS_S3_REGION_NAME', 'eu-west-1')}.amazonaws.com"
    querystring_auth = False
