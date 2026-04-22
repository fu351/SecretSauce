Set-Location 'C:\Users\afu75\Documents\GitHub\SecretSauce'
$env:PATH = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
vercel dev --listen 3050 --yes *> tmp\vercel-dev-3050-live.log
