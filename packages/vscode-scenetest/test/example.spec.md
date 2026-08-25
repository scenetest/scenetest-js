# User Authentication

## new user signs up
new-user:
- openTo /signup
- see signup-form
- typeInto email-input [new-user.email]
- typeInto password-input secretpassword123
- click submit-button
- see ~modal confirmation-dialog
- click @Confirm
- seeToast success-toast
- see dashboard

## existing user logs in
primary-user:
- openTo /login
// Enter credentials
- see login-form
- typeInto email [primary-user.email]
- typeInto password [primary-user.password]
- click submit
- wait 1000
- see dashboard main-content

# Multi-Actor Scenarios

## sender and receiver exchange messages
sender:
- openTo /compose
- see compose-form
- typeInto body Hello from sender!
- click send
- emit message-sent

receiver:
- waitFor message-sent
- openTo /inbox
- seeText New message
- click inbox-item 12345
- see message-detail
- seeInView reply-button

# Edge Cases

## modal navigation
user:
- see ~modal form-container
- click nested-button
- prev
- up
- scrollToBottom
- click

## page navigation
user:
- openTo /community
- click affirm-community-norms-button
- reload
- notSee intro-message-section
- goBack
- goForward
- switchDevice phone
- scope settings-modal
- pressKey Escape
- ifClick dismiss-button

## conditional flow
admin:
- openTo /admin
- if error-banner
  - click dismiss
  - notSee error-banner
- see admin-dashboard

## macro usage
test-user:
- login() alice@test.com secret123
- see dashboard

## warning action
user:
- warnIf slow-query Performance issue detected
- see results
