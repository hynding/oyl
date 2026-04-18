import React from 'react';
import { Section } from '@oyl/storybook-oyl'

type Props = {
  title: string;
  children?: React.ReactNode;
}

export default function DailySection({
  title,
  children
}: Props) {
  return (
    <Section title={title}>
      {children}
    </Section>
  )
}