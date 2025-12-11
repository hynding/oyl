import Head from "next/head";
import Script from "next/script";
import { useEffect } from "react";
import { PaperProvider } from 'react-native-paper';

export default function App({ Component, pageProps }) {
  // useEffect(() => {
  //   const handleGoogleSignIn = () => {
  //     console.log("Loading Google Sign-In");
  //     window.gapi.load('auth2', function() {
  //       window.gapi.auth2.init({
  //         client_id: '161255460863-1fv9phgn16bkgcm7nm0hiffdaqrf0upq.apps.googleusercontent.com',
  //       });
  //     });
  //   };
  //   console.log("window:", window);

  //   if (typeof window !== 'undefined') {
  //     handleGoogleSignIn();
  //   }
  // }, []);
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <PaperProvider>
        <Component {...pageProps} />
      </PaperProvider>
    </>
  );
}
