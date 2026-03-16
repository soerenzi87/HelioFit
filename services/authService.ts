
export const CLIENT_ID = '344613778388-bkoh4omh6pk30vbtfpmkh2c1n1keal6p.apps.googleusercontent.com';

interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

export const initGoogleLogin = (onLogin: (user: GoogleUser) => void) => {
  if (!(window as any).google) return;

  (window as any).google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response: any) => {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      onLogin({
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      });
    },
  });
};

export const renderGoogleButton = (elementId: string) => {
  if (!(window as any).google) return;
  
  (window as any).google.accounts.id.renderButton(
    document.getElementById(elementId),
    { 
      theme: 'outline', 
      size: 'large', 
      width: '100%',
      text: 'signin_with',
      shape: 'pill'
    }
  );
};
