import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, MD2Colors, TextInput } from 'react-native-paper';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Expo + Next.js 👋</Text>
      <TextInput label="Password" mode="outlined" style={styles.input} secureTextEntry />

      <ActivityIndicator animating={true} color={MD2Colors.red800} />
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 16,
  },
});
