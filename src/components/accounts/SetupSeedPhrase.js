import React, { Component, Fragment } from 'react'
import { withRouter, Route } from 'react-router-dom'
import { connect } from 'react-redux'
import { Translate } from 'react-localize-redux'
import { parse as parseQuery } from 'query-string'
import {
    handleAddAccessKeySeedPhrase, 
    refreshAccount, 
    checkIsNew, 
    handleCreateAccountWithSeedPhrase,
    loadRecoveryMethods
} from '../../actions/account'
import { generateSeedPhrase } from 'near-seed-phrase'
import SetupSeedPhraseVerify from './SetupSeedPhraseVerify'
import SetupSeedPhraseForm from './SetupSeedPhraseForm'
import copyText from '../../utils/copyText'
import isMobile from '../../utils/isMobile'
import { Snackbar, snackbarDuration } from '../common/Snackbar'
import Container from '../common/styled/Container.css'
import { KeyPair } from 'near-api-js'
import { Mixpanel } from '../../mixpanel/index'

class SetupSeedPhrase extends Component {
    state = {
        seedPhrase: '',
        enterWord: '',
        wordId: null,
        localAlert: null,
        successSnackbar: false,
        submitting: false
    }

    componentDidMount = () => {
        this.refreshData()

        if (this.props.accountId === this.props.activeAccountId) {
            this.props.loadRecoveryMethods()
        }
    }

    refreshData = () => {

        const { seedPhrase, publicKey, secretKey } = generateSeedPhrase()
        const recoveryKeyPair = KeyPair.fromString(secretKey)
        const wordId = Math.floor(Math.random() * 12)

        this.setState((prevState) => ({
            ...prevState,
            seedPhrase,
            publicKey,
            wordId,
            enterWord: '',
            localAlert: null,
            recoveryKeyPair
        }))
    }

    handleChangeWord = (e, { name, value }) => {
        if (value.match(/[^a-zA-Z]/)) {
            return false
        }

        this.setState((state) => ({
           [name]: value.trim().toLowerCase(),
           localAlert: null
        }))
    }

    handleStartOver = e => {
        const {
            history,
            location,
            accountId, 
        } = this.props

        this.refreshData()
        history.push(`/setup-seed-phrase/${accountId}/phrase${location.search}`)
    }

    handleVerifyPhrase = () => {
        const { seedPhrase, enterWord, wordId, submitting } = this.state
        Mixpanel.track("SR-SP Verify start")
        if (enterWord !== seedPhrase.split(' ')[wordId]) {
            this.setState(() => ({
                localAlert: {
                    success: false,
                    messageCode: 'account.verifySeedPhrase.error'
                }
            }))
            Mixpanel.track("SR-SP Verify fail", {error: 'word is not matched the phrase'})
            return false
        }

        if (!submitting) {
            this.setState({ submitting: true }, this.handleSetupSeedPhrase)
        }
        Mixpanel.track("SR-SP Verify finish")
    }

    handleSetupSeedPhrase = async () => {
        const { 
            accountId,
            handleAddAccessKeySeedPhrase,
            handleCreateAccountWithSeedPhrase,
            checkIsNew,
            location
        } = this.props
        const { recoveryKeyPair } = this.state
        const isNew = await checkIsNew(accountId)

        if (!isNew) {
            await Mixpanel.withTracking("SR-SP Setup for existing account",
                async () => await handleAddAccessKeySeedPhrase(accountId, recoveryKeyPair)
            )
            return
        }

        const queryOptions = parseQuery(location.search);
        const fundingOptions = JSON.parse(queryOptions.fundingOptions || 'null')
        const recaptchaToken = queryOptions.recaptchaToken;

        await Mixpanel.withTracking("SR-SP Setup for new account", 
            async () => await handleCreateAccountWithSeedPhrase(accountId, recoveryKeyPair, fundingOptions, recaptchaToken)
        )
    }

    handleCopyPhrase = () => {
        Mixpanel.track("SR-SP Copy seed phrase")
        if (navigator.share && isMobile()) {
            navigator.share({
                text: this.state.seedPhrase
            }).catch(err => {
                console.log(err.message);
            });
        } else {
            this.handleCopyDesktop();
        }
    }

    handleCopyDesktop = () => {
        copyText(document.getElementById('seed-phrase'));
        this.setState({ successSnackbar: true }, () => {
            setTimeout(() => {
                this.setState({ successSnackbar: false });
            }, snackbarDuration)
        });
    }

    render() {
        const recoveryMethods = this.props.recoveryMethods[this.props.accountId]
        const hasSeedPhraseRecovery = recoveryMethods && recoveryMethods.filter(m => m.kind === 'phrase').length > 0
        return (
            <Translate>
                {({ translate }) => (
                    <Fragment>
                        <Route 
                            exact
                            path={`/setup-seed-phrase/:accountId/phrase`}
                            render={() => (
                                <Container className='small-centered'>
                                    <h1><Translate id='setupSeedPhrase.pageTitle'/></h1>
                                    <h2><Translate id='setupSeedPhrase.pageText'/></h2>
                                    <SetupSeedPhraseForm
                                        seedPhrase={this.state.seedPhrase}
                                        handleCopyPhrase={this.handleCopyPhrase}
                                        hasSeedPhraseRecovery={hasSeedPhraseRecovery}
                                    />
                                </Container>
                            )}
                        />
                        <Route 
                            exact
                            path={`/setup-seed-phrase/:accountId/verify`}
                            render={() => (
                                <Container className='small-centered'>
                                    <form onSubmit={e => {this.handleVerifyPhrase(); e.preventDefault();}} autoComplete='off'>
                                        <h1><Translate id='setupSeedPhraseVerify.pageTitle'/></h1>
                                        <h2><Translate id='setupSeedPhraseVerify.pageText'/></h2>
                                        <SetupSeedPhraseVerify
                                            enterWord={this.state.enterWord}
                                            wordId={this.state.wordId}
                                            handleChangeWord={this.handleChangeWord}
                                            handleStartOver={this.handleStartOver}
                                            mainLoader={this.props.mainLoader || this.state.submitting}
                                            localAlert={this.state.localAlert}
                                            globalAlert={this.props.globalAlert}
                                        />
                                    </form>
                                </Container>
                            )}
                        />
                        <Snackbar
                            theme='success'
                            message={translate('setupSeedPhrase.snackbarCopySuccess')}
                            show={this.state.successSnackbar}
                            onHide={() => this.setState({ successSnackbar: false })}
                        />
                    </Fragment>
                )}
            </Translate>
        )
    }
}

const mapDispatchToProps = {
    handleAddAccessKeySeedPhrase,
    refreshAccount,
    checkIsNew,
    handleCreateAccountWithSeedPhrase,
    loadRecoveryMethods
}

const mapStateToProps = ({ account, recoveryMethods, status }, { match }) => ({
    ...account,
    verify: match.params.verify,
    accountId: match.params.accountId,
    activeAccountId: account.accountId,
    recoveryMethods,
    mainLoader: status.mainLoader
})

export const SetupSeedPhraseWithRouter = connect(mapStateToProps, mapDispatchToProps)(withRouter(SetupSeedPhrase))
