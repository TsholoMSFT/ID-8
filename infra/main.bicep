targetScope = 'resourceGroup'

@description('Canonical Static Web App. The managed API is deployed with the frontend.')
param staticSiteName string = 'id8-app'

@description('Keep the existing Static Web App region.')
param location string = 'eastus2'

@description('Existing private storage account. Do not replace or delete customer data.')
param storageAccountName string = 'kaaborsstorage'

@description('GitHub repository containing the canonical deployment workflow.')
param repositoryUrl string = 'https://github.com/TsholoMSFT/ID-8'

param branch string = 'main'

resource site 'Microsoft.Web/staticSites@2024-04-01' = {
  name: staticSiteName
  location: location
  tags: {
    'azd-service-name': 'web'
    application: 'id8'
  }
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: branch
    provider: 'GitHub'
    buildProperties: {
      appLocation: '/'
      apiLocation: 'api'
      appArtifactLocation: 'dist'
      skipGithubActionWorkflowGeneration: true
    }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

output AZURE_STATIC_WEB_APP_NAME string = site.name
output AZURE_STATIC_WEB_APP_HOSTNAME string = site.properties.defaultHostname
output AZURE_STORAGE_ACCOUNT_NAME string = storage.name
output AZURE_LOCATION string = location
