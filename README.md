# Template for making local first applications

![Local First](https://github.com/qwertyu-alex/comma-replicache-template/assets/10188306/cc38e23b-d5cc-4420-971c-d68699b91602)

This template simplifies the inital setup of making a local first application.
It uses Replicache and NextJs. Some efforts has been made in this template to improve the TypeScript experience, although there are still some additional things that can be improve. I might come around to do that. 

Uses the following technologies:
- NextJs
    - React framework
    - Uses App router
- Replicache
    - Local first framework
- AuthJs
    - Auth framework
    - v5, credentials (username, password)
- Prisma
    - Database ORM
- Supabase
    - Websocket to listen for data changes

## Setup

```sh

cp .env.example .env
# Fill in the .env file with appropriate environment variables

# I am using pnpm, but feel free to use something else
pnpm install

# Setup database (Requires docker)
npx supabase start
npx prisma db push

pnpm dev
```

## What is local first type applications
Localfirst (also called offline first in mobile) is a way of building application that by default works without connection to a server. This means that changes happens locally, and occasionally gets synced on server. "Source of truth" is defined on the client rather on the server. 

The advatage of local first type applications is two fold:
- Speed
- Accessibility

Local first applications are faster than traditional client-server applications because changes does not need to wait for the server. Changes happens without a round-trip to the server. 

Because we by default do not need the server, if the connection to the server goes down, we can still work, and changes will still be saved on the local machine. This makes apps more accessible as you can use them even on "offline mode". 

## Considerations
Replicache is a client side framework that utilizes the IndexedDB browser database. 
It has a generous free tier but is closed source so debugging can sometimes be complex.
For any issues, visit [https://github.com/rocicorp/replicache](https://github.com/rocicorp/replicache)


## 🧐
Follow me on X or reach out if you have any questions:
[qwertyu_alex](https://twitter.com/qwertyu_alex)
