import { connect } from '@mjolnir/plugin-sdk'
import { createAzureProvider } from './azure'

const mjolnir = await connect()
mjolnir.providers.register('azure-devops', createAzureProvider((request) => mjolnir.http.request(request)))
