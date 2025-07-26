# Australian Deployment Guide - Reporting Room

## Database Configuration (Sydney Region)

### Neon PostgreSQL Setup
- **Region**: AWS Asia Pacific (Sydney) - `aws-ap-southeast-2`
- **Benefits**: 
  - Australian data residency
  - Low latency for Victoria (~900km from Melbourne)
  - GDPR/Privacy Act compliance
  - Encrypted at rest and in transit

### Connection Setup
1. Create Neon project in Sydney region
2. Update `DATABASE_URL` environment variable:
   ```
   DATABASE_URL=postgresql://user:pass@proj.aws-ap-southeast-2.neon.tech/dbname
   ```

## File Storage Migration (Required for Production)

### Current Issue
- Files currently stored locally in `/uploads/` directory
- **Will not persist** on Replit deployments
- Need cloud storage for production deployment

### Recommended: AWS S3 Sydney Region

**Setup Steps:**
1. Create AWS S3 bucket in `ap-southeast-2` (Sydney)
2. Configure IAM user with S3 permissions
3. Update file upload handling to use S3

**Required Environment Variables:**
```
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=your-bucket-name
```

## Data Sovereignty Compliance

### Australian Privacy Act Compliance
- ✅ Database: Sydney region (Australian soil)
- ✅ Files: S3 Sydney region (Australian soil)
- ✅ Encryption: At rest and in transit
- ✅ Backups: Same region retention

### HIPAA/Medical Data Considerations
- Neon offers BAA (Business Associate Agreement)
- AWS offers HIPAA-eligible services
- Consider additional encryption for sensitive medical data

## Performance Optimization

### Expected Latency (Sydney to Victoria)
- **Database queries**: ~15-25ms
- **File uploads**: ~20-30ms
- **Overall app performance**: Excellent for Australian users

### Monitoring
- Use Neon's latency dashboard
- Monitor S3 performance metrics
- Set up CloudWatch alerts

## Next Steps

1. **Immediate**: Create Neon database in Sydney region
2. **Before deployment**: Implement S3 file storage
3. **Optional**: Set up CDN (CloudFront) for faster file delivery
4. **Compliance**: Review with legal team if handling sensitive medical data

## Cost Considerations

### Neon PostgreSQL
- Free tier: 512MB storage, 1 compute unit
- Pro tier: $19/month + usage
- Scale tier: Usage-based pricing

### AWS S3 Sydney
- Storage: ~$0.025/GB/month
- Data transfer: Free for first 1GB/month
- Requests: ~$0.0004 per 1,000 requests

## Support Contacts

- **Neon Support**: Available via console
- **AWS Support**: Multiple tiers available
- **Australian Business Hours**: Both services offer 24/7 support